import type { Track } from '../../types/Track'
import { computeCoverageStats } from '../continuous/coverageAnalysis'

import { buildBaselineMatrix, DEFAULT_BASELINE_CONFIG } from './baseline'
import { buildHistogramBasis, buildRaisedCosineLogBasis } from './basis'
import { buildDecayByScaleBin, buildInteractDecayByBin } from './decay'
import { coverageToWindows, discretizeEvents, getEventTimesPerType, totalObservedMs } from './discretize'
import { buildLagBins, buildHistoryDesign } from './history'
import { mineMotifs } from './motifs'
import { buildNonlinearSpec } from './nonlinear'
import { buildProjIndex, buildAchlioptasProjections } from './projections'
import { runStabilitySelection, type StabilityConfig } from './stability'
import { extractEdges, extractRhythms, extractMotifSummaries, generateInsights } from './summarize'
import { fitSwitchingModel, type SwitchingModelConfig } from './switchingModel'
import {
	DEFAULT_CONFIG,
	type PipelineConfig,
	type ProgressCallback,
	type HistoryDesign,
	type BinnedData,
	type ModelRuntime,
	type LagBins,
	type ProjIndex
} from './types'
import { validateModel } from './validate'
import {
	type WorkerRequestMessageV2,
	type WorkerResponseMessageV2,
	type WorkerOptionsV2,
	type ContinuousInsightsResultSerializable,
	type DiagnosticSerializable,
	serializeEdge,
	serializeBaseline,
	serializeMotif,
	serializeInsight,
	serializeValidation
} from './workerTypes'

const ctx: Worker = self as unknown as Worker

function postProgress (stage: string, percent: number, detail?: string): void {
	const msg: WorkerResponseMessageV2 = { type: 'progress', stage, percent, detail }
	ctx.postMessage(msg)
}

function postResult (data: ContinuousInsightsResultSerializable): void {
	const msg: WorkerResponseMessageV2 = { type: 'result', data }
	ctx.postMessage(msg)
}

function postError (message: string): void {
	const msg: WorkerResponseMessageV2 = { type: 'error', message }
	ctx.postMessage(msg)
}

function mergeConfig (base: PipelineConfig, partial?: Partial<PipelineConfig>): PipelineConfig {
	if (!partial) { return base }

	return {
		binning: { ...base.binning, ...partial.binning },
		lagBins: { ...base.lagBins, ...partial.lagBins },
		lagKernels: { ...base.lagKernels, ...partial.lagKernels },
		regimes: { ...base.regimes, ...partial.regimes },
		penalties: { ...base.penalties, ...partial.penalties },
		thresholds: { ...base.thresholds, ...partial.thresholds },
		stability: { ...base.stability, ...partial.stability },
		motifs: { ...base.motifs, ...partial.motifs },
		em: { ...base.em, ...partial.em },
		nonlinear: { ...base.nonlinear, ...partial.nonlinear },
		interactions: { ...base.interactions, ...partial.interactions }
	}
}

function buildRuntime (
	binnedData: BinnedData,
	history: HistoryDesign,
	lagBins: LagBins,
	config: PipelineConfig
): ModelRuntime {
	const { numTypes } = binnedData
	const B = history.B

	const basis = config.lagKernels.kind === 'raised_cosine_log'
		? buildRaisedCosineLogBasis(lagBins, config.lagKernels.J, config.lagKernels.epsilonHours)
		: buildHistogramBasis(lagBins)

	const nonlinearSpec = config.nonlinear.enabled === true
		? buildNonlinearSpec(config.nonlinear.scalesHours, config.nonlinear.knots)
		: undefined

	const decayByScaleBin = nonlinearSpec !== undefined
		? buildDecayByScaleBin(lagBins, config.nonlinear.scalesHours)
		: undefined

	let projIndex: ProjIndex | undefined
	if (config.interactions.enabled === true) {
		const K = numTypes * B
		const projections = buildAchlioptasProjections(config.interactions.F, K, config.interactions.seed)
		projIndex = buildProjIndex(projections)
	}

	const interactDecayByBin = projIndex !== undefined
		? buildInteractDecayByBin(lagBins, config.interactions.decayScaleHours)
		: undefined

	history.basis = basis
	history.decayByScaleBin = decayByScaleBin
	history.interactDecayByBin = interactDecayByBin

	return {
		basis,
		projIndex,
		nonlinearSpec,
		decayByScaleBin,
		interactDecayByBin
	}
}

async function runAnalysisV2 (tracks: Track[], options: WorkerOptionsV2): Promise<void> {
	try {
		const config = mergeConfig(DEFAULT_CONFIG, options.config)

		postProgress('Analyzing coverage', 2, 'Computing observation windows')

		const coverage = computeCoverageStats(tracks)
		const windows = coverageToWindows(coverage)

		if (windows.length === 0) {
			postResult(emptyResult(coverage))
			return
		}

		postProgress('Discretizing events', 5, 'Building time bins')

		const binnedData = discretizeEvents(tracks, windows, config.binning)

		if (binnedData.T === 0 || binnedData.numTypes < 2) {
			postResult(emptyResult(coverage, binnedData.T, 0, binnedData.numTypes))
			return
		}

		const totalMs = totalObservedMs(windows)
		const totalObservedHours = totalMs / (60 * 60 * 1000)
		let numEvents = 0
		for (let k = 0; k < binnedData.numTypes; k++) {
			numEvents += binnedData.eventCountsByType[k]
		}

		if (numEvents < 50) {
			postResult(emptyResult(coverage, binnedData.T, numEvents, binnedData.numTypes, totalObservedHours))
			return
		}

		postProgress('Building baseline features', 10, `${binnedData.T} bins, ${binnedData.numTypes} types`)

		const baseline = buildBaselineMatrix(binnedData, DEFAULT_BASELINE_CONFIG)

		postProgress('Building history features', 15, 'Computing lag histograms')

		const lagBins = buildLagBins(config.lagBins)
		const eventTimesPerType = getEventTimesPerType(tracks, windows, binnedData.typeIndex)
		const defaultBasis = buildHistogramBasis(lagBins)
		const history = buildHistoryDesign(binnedData, eventTimesPerType, lagBins, defaultBasis)

		postProgress('Mining motifs', 20, 'Discovering patterns')

		const motifConfig = {
			...config.motifs,
			minPairSupport: config.thresholds.minPairSupport
		}
		const motifSet = mineMotifs(binnedData, eventTimesPerType, windows, motifConfig)

		postProgress('Building runtime', 22, 'Preparing basis and projections')

		const runtime = buildRuntime(binnedData, history, lagBins, config)

		postProgress('Fitting model', 25, `${config.regimes.R} regimes`)

		const modelConfig: SwitchingModelConfig = {
			R: config.regimes.R,
			stickyPrior: config.regimes.stickyPrior,
			penalties: config.penalties,
			em: config.em,
			thresholds: {
				minEventsPerType: config.thresholds.minEventsPerType,
				minTargetEventsForEdges: config.thresholds.minTargetEventsForEdges
			}
		}

		const fitProgress: ProgressCallback = (stage, percent, detail) => {
			const scaled = 25 + Math.round(percent * 0.45)
			postProgress(stage, scaled, detail)
		}

		const fitResult = fitSwitchingModel(
			binnedData,
			baseline,
			history,
			motifSet,
			modelConfig,
			runtime,
			fitProgress
		)

		postProgress('Validating model', 72, 'Computing held-out likelihood')

		const validation = validateModel(
			binnedData,
			baseline,
			history,
			motifSet,
			fitResult,
			0.7,
			runtime
		)

		let stability = null
		if (config.stability.enabled) {
			postProgress('Stability selection', 75, `${config.stability.runs} bootstrap runs`)

			const stabilityConfig: StabilityConfig = {
				runs: config.stability.runs,
				subsampleRatio: config.stability.subsampleRatio,
				fastEM: {
					maxIter: Math.max(5, Math.floor(config.em.maxIter / 3)),
					maxMstepIter: Math.max(25, Math.floor(config.em.maxMstepIter / 3))
				}
			}

			const stabilityProgress: ProgressCallback = (stage, percent, detail) => {
				const scaled = 75 + Math.round(percent * 0.15)
				postProgress(stage, scaled, detail)
			}

			stability = runStabilitySelection(
				binnedData,
				baseline,
				history,
				motifSet,
				windows,
				modelConfig,
				stabilityConfig,
				runtime,
				stabilityProgress
			)
		}

		postProgress('Extracting insights', 92, 'Building summaries')

		const edges = extractEdges(
			binnedData,
			fitResult,
			lagBins,
			runtime.basis,
			stability,
			validation,
			config.thresholds
		)

		const rhythms = extractRhythms(binnedData, fitResult)

		const motifSummaries = extractMotifSummaries(
			binnedData,
			motifSet,
			fitResult,
			stability,
			config.thresholds
		)

		const insights = generateInsights(edges, rhythms, motifSummaries, 20)

		postProgress('Finalizing', 98, 'Serializing results')

		const diagnostics: DiagnosticSerializable[] = []
		for (let k = 0; k < binnedData.numTypes; k++) {
			diagnostics.push({
				typeName: binnedData.typeNames[k],
				typeIndex: k,
				calibrationError: 0
			})
		}

		postProgress('Complete', 100, 'Analysis finished')

		postResult({
			insights: insights.map(serializeInsight),
			edges: edges.map(serializeEdge),
			baselines: rhythms.map(serializeBaseline),
			motifs: motifSummaries.map(serializeMotif),
			diagnostics,
			validation: serializeValidation(validation),
			coverage,
			totalObservedHours,
			numEvents,
			numTypes: binnedData.numTypes,
			numBins: binnedData.T,
			numRegimes: config.regimes.R,
			modelFitted: true,
			converged: fitResult.converged,
			trainLogLik: fitResult.trainLogLik
		})
	} catch (err) {
		postError(err instanceof Error ? err.message : 'Unknown error during analysis')
	}
}

function emptyResult (
	coverage: ReturnType<typeof computeCoverageStats>,
	numBins: number = 0,
	numEvents: number = 0,
	numTypes: number = 0,
	totalObservedHours: number = 0
): ContinuousInsightsResultSerializable {
	return {
		insights: [],
		edges: [],
		baselines: [],
		motifs: [],
		diagnostics: [],
		validation: null,
		coverage,
		totalObservedHours,
		numEvents,
		numTypes,
		numBins,
		numRegimes: 0,
		modelFitted: false,
		converged: false,
		trainLogLik: []
	}
}

ctx.onmessage = (event: MessageEvent<WorkerRequestMessageV2>) => {
	const msg = event.data

	if (msg.type === 'start') {
		runAnalysisV2(msg.tracks, msg.options).catch(err => {
			postError(err instanceof Error ? err.message : 'Analysis failed')
		})
	}
}
