import {
	createExponentialBasis,
	findPeakLag,
	integratedEffect
} from './basis'
import type { FullModelFit } from './fit'
import { extractInfluenceWeights } from './fit'

export interface InfluenceEdge {
	sourceType: string
	targetType: string
	peakLagMs: number
	peakLagLabel: string
	peakEffect: number
	integratedEffect: number
	hazardRatioAtPeak: number
	direction: 'excite' | 'inhibit' | 'neutral'
	strength: number
	weights: Float64Array
}

export interface BaselineSummary {
	typeName: string
	interceptLogRate: number
	hourPeakTime: number
	hourAmplitude: number
	dowPeakDay: number
	dowAmplitude: number
}

export interface ContinuousInsight {
	id: string
	type: 'influence' | 'rhythm' | 'co-occurrence'
	title: string
	description: string
	effectSize: number
	peakLag: string
	confidence: number
	metadata: Record<string, unknown>
}

function msToReadableLabel (ms: number): string {
	const hours = ms / (60 * 60 * 1000)
	if (hours < 1) {
		return `${Math.round(hours * 60)}min`
	}
	if (hours < 24) {
		return `${hours.toFixed(1)}h`
	}
	const days = hours / 24
	return `${days.toFixed(1)}d`
}

export function extractAllInfluenceEdges (fit: FullModelFit, minStrength: number = 0.1): InfluenceEdge[] {
	const { params, typeNames } = fit
	const numTypes = typeNames.length
	const numBases = params.numBases
	const basis = createExponentialBasis()
	const taus = basis.taus.slice(0, numBases)

	const edges: InfluenceEdge[] = []

	for (let src = 0; src < numTypes; src++) {
		for (let tgt = 0; tgt < numTypes; tgt++) {
			if (src === tgt) { continue }

			const weights = extractInfluenceWeights(fit, src, tgt)

			const totalAbsWeight = weights.reduce((sum, w) => sum + Math.abs(w), 0)
			if (totalAbsWeight < minStrength) { continue }

			const { peakLagMs, peakValue } = findPeakLag(weights, taus)
			const integrated = integratedEffect(weights, taus)
			const hr = Math.exp(peakValue)

			let direction: 'excite' | 'inhibit' | 'neutral' = 'neutral'
			if (peakValue > 0.1) {
				direction = 'excite'
			} else if (peakValue < -0.1) {
				direction = 'inhibit'
			}

			const strengthCompressed = totalAbsWeight / (1 + totalAbsWeight)

			edges.push({
				sourceType: typeNames[src],
				targetType: typeNames[tgt],
				peakLagMs,
				peakLagLabel: msToReadableLabel(peakLagMs),
				peakEffect: peakValue,
				integratedEffect: integrated,
				hazardRatioAtPeak: hr,
				direction,
				strength: strengthCompressed,
				weights
			})
		}
	}

	edges.sort((a, b) => b.strength - a.strength)

	return edges
}

export function extractBaselineSummaries (fit: FullModelFit): BaselineSummary[] {
	const { params, typeNames, targetResults } = fit
	const summaries: BaselineSummary[] = []

	for (let k = 0; k < typeNames.length; k++) {
		if (!targetResults.has(k)) { continue }

		const baseOffset = k * 7
		const intercept = params.beta[baseOffset]
		const hourSin = params.beta[baseOffset + 1]
		const hourCos = params.beta[baseOffset + 2]
		const dowSin = params.beta[baseOffset + 5]
		const dowCos = params.beta[baseOffset + 6]

		const hourAmplitude = Math.sqrt(hourSin ** 2 + hourCos ** 2)
		const hourPhase = Math.atan2(hourSin, hourCos)
		const hourPeakTime = ((24 - (hourPhase * 24) / (2 * Math.PI)) % 24 + 24) % 24

		const dowAmplitude = Math.sqrt(dowSin ** 2 + dowCos ** 2)
		const dowPhase = Math.atan2(dowSin, dowCos)
		const dowPeakDay = Math.round(((7 - (dowPhase * 7) / (2 * Math.PI)) % 7 + 7) % 7)

		summaries.push({
			typeName: typeNames[k],
			interceptLogRate: intercept,
			hourPeakTime,
			hourAmplitude,
			dowPeakDay,
			dowAmplitude
		})
	}

	return summaries
}

function formatTime (hour: number): string {
	const h = Math.floor(hour)
	const m = Math.round((hour - h) * 60)
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function dayName (dow: number): string {
	const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
	if (!Number.isFinite(dow)) { return 'Unknown day' }
	const idx = ((Math.round(dow) % 7) + 7) % 7
	return names[idx]
}

export function generateContinuousInsights (
	edges: InfluenceEdge[],
	baselines: BaselineSummary[],
	maxInsights: number = 20
): ContinuousInsight[] {
	const insights: ContinuousInsight[] = []
	let id = 0

	for (const edge of edges.slice(0, Math.floor(maxInsights * 0.6))) {
		if (edge.direction === 'neutral') { continue }

		const hrStr = edge.hazardRatioAtPeak.toFixed(2)
		const dirWord = edge.direction === 'excite' ? 'increases' : 'decreases'
		const isCoOccurrence = edge.peakLagMs < 30 * 60 * 1000

		if (isCoOccurrence) {
			insights.push({
				id: `co-${id++}`,
				type: 'co-occurrence',
				title: `${edge.sourceType} ↔ ${edge.targetType}`,
				description: `${edge.sourceType} and ${edge.targetType} tend to occur together (HR=${hrStr})`,
				effectSize: edge.hazardRatioAtPeak,
				peakLag: edge.peakLagLabel,
				confidence: Math.min(1, edge.strength),
				metadata: {
					sourceType: edge.sourceType,
					targetType: edge.targetType,
					peakLagMs: edge.peakLagMs,
					integratedEffect: edge.integratedEffect
				}
			})
		} else {
			insights.push({
				id: `inf-${id++}`,
				type: 'influence',
				title: `${edge.sourceType} → ${edge.targetType}`,
				description: `${edge.sourceType} ${dirWord} ${edge.targetType} rate, peaking at ${edge.peakLagLabel} (HR=${hrStr})`,
				effectSize: edge.hazardRatioAtPeak,
				peakLag: edge.peakLagLabel,
				confidence: Math.min(1, edge.strength),
				metadata: {
					sourceType: edge.sourceType,
					targetType: edge.targetType,
					peakLagMs: edge.peakLagMs,
					integratedEffect: edge.integratedEffect,
					direction: edge.direction
				}
			})
		}
	}

	for (const baseline of baselines.slice(0, Math.floor(maxInsights * 0.4))) {
		if (baseline.hourAmplitude < 0.3 && baseline.dowAmplitude < 0.2) { continue }

		let desc = `${baseline.typeName} has`
		const parts: string[] = []

		if (baseline.hourAmplitude >= 0.3) {
			parts.push(`daily peak around ${formatTime(baseline.hourPeakTime)}`)
		}
		if (baseline.dowAmplitude >= 0.2) {
			parts.push(`weekly peak on ${dayName(baseline.dowPeakDay)}s`)
		}

		if (parts.length === 0) { continue }

		desc += ' ' + parts.join(' and ')

		insights.push({
			id: `rhythm-${id++}`,
			type: 'rhythm',
			title: `${baseline.typeName} rhythm`,
			description: desc,
			effectSize: Math.max(baseline.hourAmplitude, baseline.dowAmplitude),
			peakLag: '',
			confidence: 0.8,
			metadata: {
				hourPeakTime: baseline.hourPeakTime,
				hourAmplitude: baseline.hourAmplitude,
				dowPeakDay: baseline.dowPeakDay,
				dowAmplitude: baseline.dowAmplitude
			}
		})
	}

	return insights.slice(0, maxInsights)
}
