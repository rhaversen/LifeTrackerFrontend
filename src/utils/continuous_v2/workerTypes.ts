import type { CoverageStats } from '../../types/Insights'
import type { Track } from '../../types/Track'

import type {
	PipelineConfig,
	InfluenceEdge,
	BaselineSummary,
	ContinuousInsight,
	MotifSummary,
	ValidationResult
} from './types'

export interface InfluenceEdgeSerializable {
	sourceType: string
	targetType: string
	sourceIndex: number
	targetIndex: number
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
	selectionFreq: number
	supportSource: number
	supportTarget: number
	qualityFlags: string[]
}

export interface BaselineSummarySerializable {
	typeName: string
	typeIndex: number
	interceptLogRate: number
	hourPeakTime: number
	hourAmplitude: number
	dowPeakDay: number
	dowAmplitude: number
}

export interface MotifSummarySerializable {
	motifId: number
	motifType: 'pair' | 'co-occurrence' | 'triple'
	typeNames: string[]
	typeIndices: number[]
	effectSize: number
	hazardRatio: number
	support: number
	selectionFreq: number
	qualityFlags: string[]
}

export interface ContinuousInsightSerializable {
	id: string
	type: 'influence' | 'rhythm' | 'co-occurrence' | 'motif'
	title: string
	description: string
	effectSize: number
	peakLag: string
	confidence: number
	support: number
	metadata: Record<string, unknown>
}

export interface DiagnosticSerializable {
	typeName: string
	typeIndex: number
	calibrationError: number
}

export interface ValidationResultSerializable {
	trainLL: number
	testLL: number
	baselineTrainLL: number
	baselineTestLL: number
	llImprovement: number
	baselineImprovement: boolean
}

export interface ContinuousInsightsResultSerializable {
	insights: ContinuousInsightSerializable[]
	edges: InfluenceEdgeSerializable[]
	baselines: BaselineSummarySerializable[]
	motifs: MotifSummarySerializable[]
	diagnostics: DiagnosticSerializable[]
	validation: ValidationResultSerializable | null
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

export interface WorkerOptionsV2 {
	config?: Partial<PipelineConfig>
	translations?: Record<string, string>
}

export type WorkerRequestMessageV2 =
	| { type: 'start'; tracks: Track[]; options: WorkerOptionsV2 }
	| { type: 'cancel' }

export type WorkerResponseMessageV2 =
	| { type: 'progress'; stage: string; percent: number; detail?: string }
	| { type: 'result'; data: ContinuousInsightsResultSerializable }
	| { type: 'error'; message: string }

export function serializeEdge (edge: InfluenceEdge): InfluenceEdgeSerializable {
	return {
		sourceType: edge.sourceType,
		targetType: edge.targetType,
		sourceIndex: edge.sourceIndex,
		targetIndex: edge.targetIndex,
		peakLagMs: edge.peakLagMs,
		peakLagLabel: edge.peakLagLabel,
		massTimeMs: edge.massTimeMs,
		massTimeLabel: edge.massTimeLabel,
		peakEffect: edge.peakEffect,
		integratedEffect: edge.integratedEffect,
		hazardRatioAtPeak: edge.hazardRatioAtPeak,
		hazardRatioAt15m: edge.hazardRatioAt15m,
		hazardRatioAt1h: edge.hazardRatioAt1h,
		hazardRatioAt6h: edge.hazardRatioAt6h,
		direction: edge.direction,
		strength: edge.strength,
		selectionFreq: edge.selectionFreq,
		supportSource: edge.supportSource,
		supportTarget: edge.supportTarget,
		qualityFlags: edge.qualityFlags
	}
}

export function serializeBaseline (baseline: BaselineSummary): BaselineSummarySerializable {
	return {
		typeName: baseline.typeName,
		typeIndex: baseline.typeIndex,
		interceptLogRate: baseline.interceptLogRate,
		hourPeakTime: baseline.hourPeakTime,
		hourAmplitude: baseline.hourAmplitude,
		dowPeakDay: baseline.dowPeakDay,
		dowAmplitude: baseline.dowAmplitude
	}
}

export function serializeMotif (motif: MotifSummary): MotifSummarySerializable {
	return {
		motifId: motif.motif.id,
		motifType: motif.motif.type,
		typeNames: motif.typeNames,
		typeIndices: motif.motif.typeIndices,
		effectSize: motif.effectSize,
		hazardRatio: motif.hazardRatio,
		support: motif.support,
		selectionFreq: motif.selectionFreq,
		qualityFlags: motif.qualityFlags
	}
}

export function serializeInsight (insight: ContinuousInsight): ContinuousInsightSerializable {
	return {
		id: insight.id,
		type: insight.type,
		title: insight.title,
		description: insight.description,
		effectSize: insight.effectSize,
		peakLag: insight.peakLag,
		confidence: insight.confidence,
		support: insight.support,
		metadata: insight.metadata
	}
}

export function serializeValidation (validation: ValidationResult): ValidationResultSerializable {
	return {
		trainLL: validation.trainLL,
		testLL: validation.testLL,
		baselineTrainLL: validation.baselineTrainLL,
		baselineTestLL: validation.baselineTestLL,
		llImprovement: validation.llImprovement,
		baselineImprovement: validation.baselineImprovement
	}
}
