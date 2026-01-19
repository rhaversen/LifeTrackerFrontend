import type { Track } from '../../types/Track'

import { computeCoverageStats } from './coverageAnalysis'
import { timeRescalingDiagnostic } from './diagnostics'
import { fitFullModel, type ProgressCallback } from './fit'
import { coverageToWindows, buildEventStream, totalObservedMs } from './observationWindows'
import {
	extractAllInfluenceEdges,
	extractBaselineSummaries,
	generateContinuousInsights
} from './summarize'
import type {
	WorkerRequestMessage,
	WorkerResponseMessage,
	WorkerOptions,
	ContinuousInsightsResultSerializable,
	DiagnosticSerializable
} from './workerTypes'

const ctx: Worker = self as unknown as Worker

function postProgress (stage: string, percent: number, detail?: string): void {
	const msg: WorkerResponseMessage = { type: 'progress', stage, percent, detail }
	ctx.postMessage(msg)
}

function postResult (data: ContinuousInsightsResultSerializable): void {
	const msg: WorkerResponseMessage = { type: 'result', data }
	ctx.postMessage(msg)
}

function postError (message: string): void {
	const msg: WorkerResponseMessage = { type: 'error', message }
	ctx.postMessage(msg)
}

async function runAnalysis (tracks: Track[], options: WorkerOptions): Promise<void> {
	try {
		const {
			numBases = 6,
			maxIter = 150,
			learningRate = 0.01,
			lambda1 = 0.01,
			lambda2 = 0.001,
			minStrength = 0.1,
			maxInsights = 20
		} = options

		postProgress('Analyzing coverage', 5, 'Computing observation windows')

		const coverage = computeCoverageStats(tracks)
		const windows = coverageToWindows(coverage)

		if (windows.length === 0) {
			postResult({
				insights: [],
				edges: [],
				baselines: [],
				diagnostics: [],
				coverage,
				totalObservedHours: 0,
				numEvents: 0,
				numTypes: 0,
				modelFitted: false
			})
			return
		}

		postProgress('Building event stream', 10, 'Processing tracks')

		const stream = buildEventStream(tracks, windows)
		const totalMs = totalObservedMs(windows)
		const totalObservedHours = totalMs / (60 * 60 * 1000)

		if (stream.times.length < 50 || stream.typeNames.length < 2) {
			postResult({
				insights: [],
				edges: [],
				baselines: [],
				diagnostics: [],
				coverage,
				totalObservedHours,
				numEvents: stream.times.length,
				numTypes: stream.typeNames.length,
				modelFitted: false
			})
			return
		}

		const fitProgress: ProgressCallback = (stage, percent, detail) => {
			const scaledPercent = 15 + Math.round(percent * 0.7)
			postProgress(stage, scaledPercent, detail)
		}

		const fit = await fitFullModel(stream, windows, numBases, {
			maxIter,
			learningRate,
			lambda1,
			lambda2
		}, fitProgress)

		postProgress('Extracting insights', 90, 'Analyzing influence patterns')

		const edgesRaw = extractAllInfluenceEdges(fit, minStrength)
		const baselines = extractBaselineSummaries(fit)
		const insights = generateContinuousInsights(edgesRaw, baselines, maxInsights)

		const edges = edgesRaw.map(e => ({
			sourceType: e.sourceType,
			targetType: e.targetType,
			peakLagMs: e.peakLagMs,
			peakLagLabel: e.peakLagLabel,
			peakEffect: e.peakEffect,
			integratedEffect: e.integratedEffect,
			hazardRatioAtPeak: e.hazardRatioAtPeak,
			direction: e.direction,
			strength: e.strength
		}))

		postProgress('Running diagnostics', 95, 'Validating model fit')

		const diagnostics: DiagnosticSerializable[] = []
		for (const [k, _result] of fit.targetResults) {
			const diag = timeRescalingDiagnostic(fit.params, stream, windows, k)
			diagnostics.push({
				typeName: stream.typeNames[k],
				ksStatistic: diag.ksStatistic,
				ksPassesAt05: diag.ksPassesAt05
			})
		}

		postProgress('Complete', 100, 'Analysis finished')

		postResult({
			insights,
			edges,
			baselines,
			diagnostics,
			coverage,
			totalObservedHours,
			numEvents: stream.times.length,
			numTypes: stream.typeNames.length,
			modelFitted: true
		})
	} catch (err) {
		postError(err instanceof Error ? err.message : 'Unknown error during analysis')
	}
}

ctx.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
	const msg = event.data

	if (msg.type === 'start') {
		runAnalysis(msg.tracks, msg.options).catch(err => {
			postError(err instanceof Error ? err.message : 'Analysis failed')
		})
	}
}
