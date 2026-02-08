import type { CoverageStats } from '../../types/Insights'
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
	type BinnedData,
	type BaselineDesign,
	type HistoryDesign,
	type LagBins,
	type MotifSet,
	type FitResult,
	type StabilityResult,
	type ValidationResult,
	type InfluenceEdge,
	type BaselineSummary,
	type MotifSummary,
	type ContinuousInsight,
	type ProgressCallback,
	type ObservationWindow,
	type ModelRuntime,
	type LagBasis,
	type NonlinearSpec,
	type ProjIndex
} from './types'
import { validateModel } from './validate'

export interface ContinuousInsightsResultV2 {
	insights: ContinuousInsight[]
	edges: InfluenceEdge[]
	baselines: BaselineSummary[]
	motifs: MotifSummary[]
	validation: ValidationResult | null
	stability: StabilityResult | null
	coverage: CoverageStats
	totalObservedHours: number
	numEvents: number
	numTypes: number
	numBins: number
	numRegimes: number
	modelFitted: boolean
	converged: boolean
	trainLogLik: number[]
}

export async function computeContinuousInsightsV2 (
	tracks: Track[],
	options: {
		config?: Partial<PipelineConfig>
		translations?: Record<string, string>
	} = {},
	onProgress?: ProgressCallback
): Promise<ContinuousInsightsResultV2> {
	const config = mergeConfig(DEFAULT_CONFIG, options.config)

	onProgress?.('Analyzing coverage', 2, 'Computing observation windows')

	const coverage = computeCoverageStats(tracks)
	const windows = coverageToWindows(coverage)

	if (windows.length === 0) {
		return emptyResult(coverage)
	}

	onProgress?.('Discretizing events', 5, 'Building time bins')

	const binnedData = discretizeEvents(tracks, windows, config.binning)

	if (binnedData.T === 0 || binnedData.numTypes < 2) {
		return emptyResult(coverage, binnedData.T, 0, binnedData.numTypes)
	}

	const totalMs = totalObservedMs(windows)
	const totalObservedHours = totalMs / (60 * 60 * 1000)
	let numEvents = 0
	for (let k = 0; k < binnedData.numTypes; k++) {
		numEvents += binnedData.eventCountsByType[k]
	}

	if (numEvents < 50) {
		return emptyResult(coverage, binnedData.T, numEvents, binnedData.numTypes, totalObservedHours)
	}

	onProgress?.('Building baseline features', 10, `${binnedData.T} bins, ${binnedData.numTypes} types`)

	const baseline = buildBaselineMatrix(binnedData, DEFAULT_BASELINE_CONFIG)

	onProgress?.('Building history features', 15, 'Computing lag histograms')

	const lagBins = buildLagBins(config.lagBins)
	const eventTimesPerType = getEventTimesPerType(tracks, windows, binnedData.typeIndex)
	const defaultBasis = buildHistogramBasis(lagBins)
	const history = buildHistoryDesign(binnedData, eventTimesPerType, lagBins, defaultBasis)

	onProgress?.('Mining motifs', 20, 'Discovering patterns')

	const motifConfig = {
		...config.motifs,
		minPairSupport: config.thresholds.minPairSupport
	}
	const motifSet = mineMotifs(binnedData, eventTimesPerType, windows, motifConfig)

	onProgress?.('Building runtime', 22, 'Preparing basis and projections')

	const runtime = buildRuntime(binnedData, history, lagBins, config)

	onProgress?.('Fitting model', 25, `${config.regimes.R} regimes`)

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
		onProgress?.(stage, scaled, detail)
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

	onProgress?.('Validating model', 72, 'Computing held-out likelihood')

	const validation = validateModel(
		binnedData,
		baseline,
		history,
		motifSet,
		fitResult,
		0.7,
		runtime
	)

	let stability: StabilityResult | null = null
	if (config.stability.enabled) {
		onProgress?.('Stability selection', 75, `${config.stability.runs} bootstrap runs`)

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
			onProgress?.(stage, scaled, detail)
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

	onProgress?.('Extracting insights', 92, 'Building summaries')

	const edges = extractEdges(
		binnedData,
		fitResult,
		lagBins,
		runtime.basis,
		stability,
		validation,
		config.thresholds
	)

	const baselines = extractRhythms(binnedData, fitResult)

	const motifs = extractMotifSummaries(
		binnedData,
		motifSet,
		fitResult,
		stability,
		config.thresholds
	)

	const insights = generateInsights(edges, baselines, motifs, 20)

	onProgress?.('Complete', 100, 'Analysis finished')

	return {
		insights,
		edges,
		baselines,
		motifs,
		validation,
		stability,
		coverage,
		totalObservedHours,
		numEvents,
		numTypes: binnedData.numTypes,
		numBins: binnedData.T,
		numRegimes: config.regimes.R,
		modelFitted: true,
		converged: fitResult.converged,
		trainLogLik: fitResult.trainLogLik
	}
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

function emptyResult (
	coverage: CoverageStats,
	numBins: number = 0,
	numEvents: number = 0,
	numTypes: number = 0,
	totalObservedHours: number = 0
): ContinuousInsightsResultV2 {
	return {
		insights: [],
		edges: [],
		baselines: [],
		motifs: [],
		validation: null,
		stability: null,
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

export {
	DEFAULT_CONFIG,
	type PipelineConfig,
	type BinnedData,
	type BaselineDesign,
	type HistoryDesign,
	type LagBins,
	type MotifSet,
	type FitResult,
	type StabilityResult,
	type ValidationResult,
	type InfluenceEdge,
	type BaselineSummary,
	type MotifSummary,
	type ContinuousInsight,
	type ProgressCallback,
	type ObservationWindow,
	type ModelRuntime,
	type LagBasis,
	type NonlinearSpec,
	type ProjIndex
}

export { coverageToWindows, discretizeEvents, totalObservedMs } from './discretize'
export { buildBaselineMatrix, DEFAULT_BASELINE_CONFIG } from './baseline'
export { buildLagBins, buildHistoryDesign } from './history'
export { buildHistogramBasis, buildRaisedCosineLogBasis, computeKernelByBin } from './basis'
export { buildDecayByScaleBin, buildInteractDecayByBin } from './decay'
export { buildNonlinearSpec } from './nonlinear'
export { buildProjIndex } from './projections'
export { mineMotifs } from './motifs'
export { forwardBackward, initializeHMMParams, computeAverageOccupancy, viterbiDecode } from './hmm'
export { fitSwitchingModel, getEdgeBasisCoeffs, getBaselineCoeffs, getEdgeKernelByBin } from './switchingModel'
export { runStabilitySelection } from './stability'
export { validateModel, splitTrainTestBins, computeCalibrationCurve } from './validate'
export { extractEdges, extractRhythms, extractMotifSummaries, generateInsights, msToReadableLabel } from './summarize'

export type {
	WorkerRequestMessageV2,
	WorkerResponseMessageV2,
	WorkerOptionsV2,
	ContinuousInsightsResultSerializable,
	InfluenceEdgeSerializable,
	BaselineSummarySerializable,
	MotifSummarySerializable,
	ContinuousInsightSerializable,
	DiagnosticSerializable,
	ValidationResultSerializable
} from './workerTypes'
