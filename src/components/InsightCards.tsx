'use client'

import type { ReactElement } from 'react'

import type { CoverageStats, TrackingPeriod } from '../types/Insights'

interface CoverageCardProps {
	coverage: CoverageStats
}

export function CoverageCard ({ coverage }: CoverageCardProps): ReactElement {
	const coverageColor = coverage.coveragePercent > 80 ? 'text-green-400' : coverage.coveragePercent > 50 ? 'text-yellow-400' : 'text-red-400'

	return (
		<div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
			<div className="flex items-start justify-between mb-3">
				<div className="flex items-center gap-2">
					<span className="text-2xl">{'📊'}</span>
					<span className="text-xs font-medium text-cyan-400 uppercase tracking-wide">{'Coverage'}</span>
				</div>
				<span className={`text-lg font-bold ${coverageColor}`}>
					{`${coverage.coveragePercent.toFixed(0)}%`}
				</span>
			</div>
			<div className="grid grid-cols-3 gap-4 text-center mb-4">
				<div>
					<div className="text-xl font-bold text-gray-200">{coverage.totalDays}</div>
					<div className="text-xs text-gray-500">{'Total Days'}</div>
				</div>
				<div>
					<div className="text-xl font-bold text-green-400">{coverage.activeDays}</div>
					<div className="text-xs text-gray-500">{'Active'}</div>
				</div>
				<div>
					<div className="text-xl font-bold text-red-400">{coverage.gapDays}</div>
					<div className="text-xs text-gray-500">{'Gaps'}</div>
				</div>
			</div>
			<CoverageTimeline periods={coverage.periods} />
		</div>
	)
}

interface CoverageTimelineProps {
	periods: TrackingPeriod[]
}

interface TimelineSegmentProps {
	period: TrackingPeriod
	totalDays: number
}

function TimelineSegment ({ period, totalDays }: TimelineSegmentProps): ReactElement {
	const widthPercent = (period.dayCount / totalDays) * 100
	const segmentStyle = { width: `${widthPercent}%` }

	return (
		<div
			className={period.isGap ? 'bg-red-900' : 'bg-green-700'}
			style={segmentStyle}
			title={`${period.isGap ? 'Gap' : 'Active'}: ${period.startDate.toLocaleDateString()} - ${period.endDate.toLocaleDateString()} (${period.dayCount} days)`}
		/>
	)
}

function CoverageTimeline ({ periods }: CoverageTimelineProps): ReactElement {
	if (periods.length === 0) { return <div className="text-gray-500 text-sm">{'No data'}</div> }

	const totalDays = periods.reduce((sum, p) => sum + p.dayCount, 0)

	return (
		<div className="mt-2">
			<div className="text-xs text-gray-500 mb-1">{'Timeline'}</div>
			<div className="flex h-4 rounded overflow-hidden">
				{periods.map((period, idx) => (
					<TimelineSegment key={idx} period={period} totalDays={totalDays} />
				))}
			</div>
			<div className="flex justify-between text-xs text-gray-500 mt-1">
				<span>{periods[0]?.startDate.toLocaleDateString()}</span>
				<span>{periods[periods.length - 1]?.endDate.toLocaleDateString()}</span>
			</div>
		</div>
	)
}

interface ContinuousInsightCardProps {
	insight: {
		id: string
		type: 'influence' | 'rhythm' | 'co-occurrence'
		title: string
		description: string
		effectSize: number
		peakLag: string
		confidence: number
		metadata: Record<string, unknown>
	}
}

export function ContinuousInsightCard ({ insight }: ContinuousInsightCardProps): ReactElement {
	const getTypeConfig = (): { emoji: string; label: string; color: string; borderColor: string } => {
		switch (insight.type) {
			case 'influence':
				return insight.metadata.direction === 'inhibit'
					? { emoji: '🛑', label: 'Inhibitor', color: 'text-purple-400', borderColor: 'border-l-purple-500' }
					: { emoji: '⚡', label: 'Trigger', color: 'text-orange-400', borderColor: 'border-l-orange-500' }
			case 'rhythm':
				return { emoji: '🔄', label: 'Rhythm', color: 'text-blue-400', borderColor: 'border-l-blue-500' }
			case 'co-occurrence':
				return { emoji: '🔗', label: 'Co-occurrence', color: 'text-teal-400', borderColor: 'border-l-teal-500' }
			default:
				return { emoji: '💡', label: 'Insight', color: 'text-gray-400', borderColor: 'border-l-gray-500' }
		}
	}

	const config = getTypeConfig()
	const hrStr = !isFinite(insight.effectSize)
		? '∞'
		: insight.effectSize >= 1
			? `${insight.effectSize.toFixed(2)}×`
			: `${insight.effectSize.toFixed(2)}×`

	const confPercent = Math.round(insight.confidence * 100)
	const confColor = insight.confidence > 0.7 ? 'text-green-400' : insight.confidence > 0.4 ? 'text-yellow-400' : 'text-gray-500'

	return (
		<div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 border-l-4 ${config.borderColor}`}>
			<div className="flex items-start justify-between mb-2">
				<div className="flex items-center gap-2">
					<span className="text-2xl">{config.emoji}</span>
					<span className={`text-xs font-medium ${config.color} uppercase tracking-wide`}>{config.label}</span>
				</div>
				<span className={`text-sm font-bold ${config.color}`}>{hrStr}</span>
			</div>
			<p className="text-gray-200 font-medium mb-1">{insight.title}</p>
			<p className="text-gray-400 text-sm mb-2">{insight.description}</p>
			<div className="flex flex-wrap gap-2 text-xs text-gray-500">
				{insight.type !== 'rhythm' && insight.peakLag && (
					<span className="bg-gray-700/50 px-2 py-0.5 rounded">{`peak @ ${insight.peakLag}`}</span>
				)}
				<span className={`bg-gray-700/50 px-2 py-0.5 rounded ${confColor}`}>
					{`${confPercent}% confidence`}
				</span>
			</div>
		</div>
	)
}

interface InfluenceEdgeCardProps {
	edge: {
		sourceType: string
		targetType: string
		massTimeLabel: string
		hazardRatioAt1h: number
		direction: 'excite' | 'inhibit' | 'neutral'
		strength: number
	}
	getTranslatedName: (trackName: string) => string
}

export function InfluenceEdgeCard ({ edge, getTranslatedName }: InfluenceEdgeCardProps): ReactElement {
	const config = edge.direction === 'inhibit'
		? { emoji: '🛑', color: 'text-purple-400', borderColor: 'border-l-purple-500', arrow: '⊣' }
		: { emoji: '⚡', color: 'text-orange-400', borderColor: 'border-l-orange-500', arrow: '→' }

	const hrStr = edge.hazardRatioAt1h.toFixed(2)
	const strengthPercent = Math.round(edge.strength * 100)

	return (
		<div className={`bg-gray-800 rounded-lg p-3 border border-gray-700 border-l-4 ${config.borderColor}`}>
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<span className="text-lg">{config.emoji}</span>
					<span className="text-gray-200 font-medium">
						{getTranslatedName(edge.sourceType)}
						<span className={`mx-1 ${config.color}`}>{config.arrow}</span>
						{getTranslatedName(edge.targetType)}
					</span>
				</div>
				<span className={`text-sm font-bold ${config.color}`}>{`${hrStr}× @1h`}</span>
			</div>
			<div className="flex flex-wrap gap-2 text-xs text-gray-500">
				<span className="bg-gray-700/50 px-2 py-0.5 rounded">{`50% by ${edge.massTimeLabel}`}</span>
				<span className="bg-gray-700/50 px-2 py-0.5 rounded">{`strength: ${strengthPercent}%`}</span>
			</div>
		</div>
	)
}

interface BaselineRhythmCardProps {
	baseline: {
		typeName: string
		hourPeakTime: number
		hourAmplitude: number
		dowPeakDay: number
		dowAmplitude: number
	}
	getTranslatedName: (trackName: string) => string
}

export function BaselineRhythmCard ({ baseline, getTranslatedName }: BaselineRhythmCardProps): ReactElement {
	const formatTime = (hour: number): string => {
		const h = Math.floor(hour)
		const m = Math.round((hour - h) * 60)
		return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
	}

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
	const hasDailyRhythm = baseline.hourAmplitude > 0.3
	const hasWeeklyRhythm = baseline.dowAmplitude > 0.2

	if (!hasDailyRhythm && !hasWeeklyRhythm) { return <></> }

	return (
		<div className="bg-gray-800 rounded-lg p-3 border border-gray-700 border-l-4 border-l-blue-500">
			<div className="flex items-center gap-2 mb-2">
				<span className="text-lg">{'🔄'}</span>
				<span className="text-gray-200 font-medium">{getTranslatedName(baseline.typeName)}</span>
			</div>
			<div className="flex flex-wrap gap-2 text-xs text-gray-400">
				{hasDailyRhythm && (
					<span className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded">
						{`peaks @ ${formatTime(baseline.hourPeakTime)}`}
					</span>
				)}
				{hasWeeklyRhythm && (
					<span className="bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded">
						{`${dayNames[baseline.dowPeakDay]}s`}
					</span>
				)}
			</div>
		</div>
	)
}
