import type { CoverageStats } from '../../types/Insights'
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
import type { ContinuousInsight, InfluenceEdge, BaselineSummary } from './summarize'

export interface ContinuousInsightsResult {
	insights: ContinuousInsight[]
	edges: InfluenceEdge[]
	baselines: BaselineSummary[]
	diagnostics: Map<string, { ksStatistic: number; ksPassesAt05: boolean }>
	coverage: CoverageStats
	totalObservedHours: number
	numEvents: number
	numTypes: number
	modelFitted: boolean
}

export async function computeContinuousInsights (
	tracks: Track[],
	options: {
		numBases?: number
		maxIter?: number
		learningRate?: number
		lambda1?: number
		lambda2?: number
		minStrength?: number
		maxInsights?: number
	} = {},
	onProgress?: ProgressCallback
): Promise<ContinuousInsightsResult> {
	const {
		numBases = 6,
		maxIter = 150,
		learningRate = 0.01,
		lambda1 = 0.01,
		lambda2 = 0.001,
		minStrength = 0.1,
		maxInsights = 20
	} = options

	onProgress?.('Analyzing coverage', 5, 'Computing observation windows')

	const coverage = computeCoverageStats(tracks)
	const windows = coverageToWindows(coverage)

	if (windows.length === 0) {
		return {
			insights: [],
			edges: [],
			baselines: [],
			diagnostics: new Map(),
			coverage,
			totalObservedHours: 0,
			numEvents: 0,
			numTypes: 0,
			modelFitted: false
		}
	}

	onProgress?.('Building event stream', 10, 'Processing tracks')

	const stream = buildEventStream(tracks, windows)
	const totalMs = totalObservedMs(windows)
	const totalObservedHours = totalMs / (60 * 60 * 1000)

	if (stream.times.length < 50 || stream.typeNames.length < 2) {
		return {
			insights: [],
			edges: [],
			baselines: [],
			diagnostics: new Map(),
			coverage,
			totalObservedHours,
			numEvents: stream.times.length,
			numTypes: stream.typeNames.length,
			modelFitted: false
		}
	}

	const fitProgress: ProgressCallback = (stage, percent, detail) => {
		const scaledPercent = 15 + Math.round(percent * 0.7)
		onProgress?.(stage, scaledPercent, detail)
	}

	const fit = await fitFullModel(stream, windows, numBases, {
		maxIter,
		learningRate,
		lambda1,
		lambda2
	}, fitProgress)

	onProgress?.('Extracting insights', 90, 'Analyzing influence patterns')

	const edges = extractAllInfluenceEdges(fit, minStrength)
	const baselines = extractBaselineSummaries(fit)
	const insights = generateContinuousInsights(edges, baselines, maxInsights)

	onProgress?.('Running diagnostics', 95, 'Validating model fit')

	const diagnostics = new Map<string, { ksStatistic: number; ksPassesAt05: boolean }>()
	for (const [k, _result] of fit.targetResults) {
		const diag = timeRescalingDiagnostic(fit.params, stream, windows, k)
		diagnostics.set(stream.typeNames[k], {
			ksStatistic: diag.ksStatistic,
			ksPassesAt05: diag.ksPassesAt05
		})
	}

	onProgress?.('Complete', 100, 'Analysis finished')

	return {
		insights,
		edges,
		baselines,
		diagnostics,
		coverage,
		totalObservedHours,
		numEvents: stream.times.length,
		numTypes: stream.typeNames.length,
		modelFitted: true
	}
}

export type { ContinuousInsight, InfluenceEdge, BaselineSummary }
export type { ProgressCallback }
