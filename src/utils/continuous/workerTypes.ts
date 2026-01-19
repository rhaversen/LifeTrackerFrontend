import type { CoverageStats } from '../../types/Insights'
import type { Track } from '../../types/Track'

export interface ContinuousInsightSerializable {
	id: string
	type: 'influence' | 'rhythm' | 'co-occurrence'
	title: string
	description: string
	effectSize: number
	peakLag: string
	confidence: number
	metadata: Record<string, unknown>
}

export interface InfluenceEdgeSerializable {
	sourceType: string
	targetType: string
	peakLagMs: number
	peakLagLabel: string
	massTimeMs: number
	massTimeLabel: string
	peakEffect: number
	integratedEffect: number
	hazardRatioAtPeak: number
	hazardRatioAt15m: number
	hazardRatioAt1h: number
	hazardRatioAt6h: number
	direction: 'excite' | 'inhibit' | 'neutral'
	strength: number
}

export interface BaselineSummarySerializable {
	typeName: string
	interceptLogRate: number
	hourPeakTime: number
	hourAmplitude: number
	dowPeakDay: number
	dowAmplitude: number
}

export interface DiagnosticSerializable {
	typeName: string
	ksStatistic: number
	ksPassesAt05: boolean
}

export interface ContinuousInsightsResultSerializable {
	insights: ContinuousInsightSerializable[]
	edges: InfluenceEdgeSerializable[]
	baselines: BaselineSummarySerializable[]
	diagnostics: DiagnosticSerializable[]
	coverage: CoverageStats
	totalObservedHours: number
	numEvents: number
	numTypes: number
	modelFitted: boolean
}

export interface WorkerOptions {
	numBases?: number
	maxIter?: number
	learningRate?: number
	lambda1?: number
	lambda2?: number
	minStrength?: number
	maxInsights?: number
}

export type WorkerRequestMessage =
	| { type: 'start'; tracks: Track[]; options: WorkerOptions }
	| { type: 'cancel' }

export type WorkerResponseMessage =
	| { type: 'progress'; stage: string; percent: number; detail?: string }
	| { type: 'result'; data: ContinuousInsightsResultSerializable }
	| { type: 'error'; message: string }
