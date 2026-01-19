export interface TrackingPeriod {
	startDate: Date
	endDate: Date
	dayCount: number
	eventCount: number
	isGap: boolean
}

export interface CycleInsight {
	type: 'cycle'
	trackName: string
	periodDays: number
	strength: number
	description: string
	peakDays?: string[]
}

export interface TriggerInsight {
	type: 'trigger'
	sourceType: string
	targetType: string
	windowHours: number
	relativeRisk: number
	occurrences: number
	baselineRate: number
	description: string
}

export interface InhibitorInsight {
	type: 'inhibitor'
	sourceType: string
	targetType: string
	windowHours: number
	relativeRisk: number
	occurrences: number
	description: string
}

export interface GapInsight {
	type: 'gap'
	startDate: Date
	endDate: Date
	dayCount: number
	description: string
}

export interface SimilarityInsight {
	type: 'similarity'
	trackA: string
	trackB: string
	similarity: number
	description: string
}

export interface ClusterInsight {
	type: 'cluster'
	name: string
	tracks: string[]
	description: string
}

export interface CoverageStats {
	totalDays: number
	activeDays: number
	gapDays: number
	coveragePercent: number
	periods: TrackingPeriod[]
}

export type Insight = CycleInsight | TriggerInsight | InhibitorInsight | GapInsight | SimilarityInsight | ClusterInsight
