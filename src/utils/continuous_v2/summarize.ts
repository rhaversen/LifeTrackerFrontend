import { extractFourierCoefficients, computeRhythmPeaks, DEFAULT_BASELINE_CONFIG } from './baseline'
import { computeKernelByBin, evaluateKernelAtLagHours, evaluateBasisAtLagHours } from './basis'
import { computeAverageOccupancy } from './hmm'
import { getEdgeSelectionFrequency } from './stability'
import { getEdgeBasisCoeffs, getBaselineCoeffs, aggregateAcrossRegimes } from './switchingModel'
import type {
	BinnedData,
	LagBins,
	LagBasis,
	FitResult,
	StabilityResult,
	ValidationResult,
	MotifSet,
	InfluenceEdge,
	MotifSummary,
	BaselineSummary,
	ContinuousInsight,
	PipelineConfig
} from './types'

const MS_PER_HOUR = 60 * 60 * 1000

export function msToReadableLabel (ms: number): string {
	const hours = ms / MS_PER_HOUR
	if (hours < 1 / 60) {
		const seconds = Math.round(ms / 1000)
		return seconds > 0 ? `${seconds}s` : '<1s'
	}
	if (hours < 1) {
		const minutes = Math.round(hours * 60)
		return minutes > 0 ? `${minutes}min` : '<1min'
	}
	if (hours < 24) {
		return `${hours.toFixed(1)}h`
	}
	const days = hours / 24
	return `${days.toFixed(1)}d`
}

function computeIntegratedEffect (kernelByBin: Float32Array, lagBins: LagBins): number {
	let sum = 0
	for (let b = 0; b < lagBins.B; b++) {
		sum += kernelByBin[b] * lagBins.widthsHours[b]
	}
	return sum
}

function computePeakLag (kernelByBin: Float32Array, lagBins: LagBins): { peakLagMs: number; peakEffect: number } {
	let maxAbs = 0
	let peakIdx = 0

	for (let b = 0; b < lagBins.B; b++) {
		const absW = Math.abs(kernelByBin[b])
		if (absW > maxAbs) {
			maxAbs = absW
			peakIdx = b
		}
	}

	return {
		peakLagMs: lagBins.midsHours[peakIdx] * MS_PER_HOUR,
		peakEffect: kernelByBin[peakIdx]
	}
}

function computeMassTime (kernelByBin: Float32Array, lagBins: LagBins, fraction: number = 0.5): number {
	let totalMass = 0
	for (let b = 0; b < lagBins.B; b++) {
		totalMass += Math.abs(kernelByBin[b]) * lagBins.widthsHours[b]
	}

	if (totalMass === 0) {
		return lagBins.midsHours[0] * MS_PER_HOUR
	}

	const targetMass = totalMass * fraction
	let cumMass = 0

	for (let b = 0; b < lagBins.B; b++) {
		cumMass += Math.abs(kernelByBin[b]) * lagBins.widthsHours[b]
		if (cumMass >= targetMass) {
			return lagBins.midsHours[b] * MS_PER_HOUR
		}
	}

	return lagBins.midsHours[lagBins.B - 1] * MS_PER_HOUR
}

function evaluateKernelAtLag (kernelByBin: Float32Array, lagBins: LagBins, lagHours: number): number {
	const lagMs = lagHours * MS_PER_HOUR
	const { edgesMs } = lagBins

	for (let b = 0; b < lagBins.B; b++) {
		if (lagMs >= edgesMs[b] && lagMs < edgesMs[b + 1]) {
			return kernelByBin[b]
		}
	}

	return 0
}

function evaluateKernelSmooth (basisCoeffs: Float32Array, basis: LagBasis, lagHours: number): number {
	if (basis.kind === 'raised_cosine_log') {
		const phi = evaluateBasisAtLagHours(basis, lagHours)
		let sum = 0
		for (let j = 0; j < basis.J; j++) {
			sum += basisCoeffs[j] * phi[j]
		}
		return sum
	}
	return 0
}

export function extractEdges (
	binnedData: BinnedData,
	fitResult: FitResult,
	lagBins: LagBins,
	basis: LagBasis,
	stability: StabilityResult | null,
	validation: ValidationResult | null,
	config: PipelineConfig['thresholds']
): InfluenceEdge[] {
	const { numTypes, typeNames, eventCountsByType } = binnedData
	const { params, gamma } = fitResult
	const R = params.hmm.R
	const T = gamma.length / R

	const edges: InfluenceEdge[] = []
	const occupancy = computeAverageOccupancy(gamma, R, T)

	for (let target = 0; target < numTypes; target++) {
		if (eventCountsByType[target] < config.minTargetEventsForEdges) { continue }

		for (let source = 0; source < numTypes; source++) {
			if (source === target) { continue }
			if (eventCountsByType[source] < config.minSourceEventsForEdges) { continue }

			const qualityFlags: string[] = []

			const aggregatedBasisCoeffs = aggregateAcrossRegimes(
				params, gamma, T,
				r => getEdgeBasisCoeffs(params, target, source, r)
			)

			const aggregatedKernel = computeKernelByBin(basis, aggregatedBasisCoeffs)

			const totalAbsWeight = aggregatedKernel.reduce((sum, w) => sum + Math.abs(w), 0)
			if (totalAbsWeight < config.minEffectAbs) { continue }

			let selectionFreq = 1.0
			if (stability) {
				selectionFreq = getEdgeSelectionFrequency(stability, target, source, numTypes)
				if (selectionFreq < config.minSelectionFreq) {
					qualityFlags.push('unstable')
				}
			}

			if (validation && !validation.baselineImprovement) {
				qualityFlags.push('no_ll_gain')
			}

			if (eventCountsByType[source] < 20 || eventCountsByType[target] < 20) {
				qualityFlags.push('low_data')
			}

			const integratedEffect = computeIntegratedEffect(aggregatedKernel, lagBins)
			const { peakLagMs, peakEffect } = computePeakLag(aggregatedKernel, lagBins)
			const massTimeMs = computeMassTime(aggregatedKernel, lagBins)

			let direction: 'excite' | 'inhibit' | 'neutral' = 'neutral'
			if (integratedEffect > config.minEffectAbs) {
				direction = 'excite'
			} else if (integratedEffect < -config.minEffectAbs) {
				direction = 'inhibit'
			}

			let effect15m: number
			let effect1h: number
			let effect6h: number

			if (basis.kind === 'raised_cosine_log') {
				effect15m = evaluateKernelSmooth(aggregatedBasisCoeffs, basis, 0.25)
				effect1h = evaluateKernelSmooth(aggregatedBasisCoeffs, basis, 1)
				effect6h = evaluateKernelSmooth(aggregatedBasisCoeffs, basis, 6)
			} else {
				effect15m = evaluateKernelAtLag(aggregatedKernel, lagBins, 0.25)
				effect1h = evaluateKernelAtLag(aggregatedKernel, lagBins, 1)
				effect6h = evaluateKernelAtLag(aggregatedKernel, lagBins, 6)
			}

			const strength = selectionFreq * (totalAbsWeight / (1 + totalAbsWeight))

			const regimeSpecific: InfluenceEdge['regimeSpecific'] = []
			for (let r = 0; r < R; r++) {
				const coeffs = getEdgeBasisCoeffs(params, target, source, r)
				const kernel = computeKernelByBin(basis, coeffs)
				regimeSpecific.push({
					regime: r,
					occupancy: occupancy[r],
					weights: kernel
				})
			}

			edges.push({
				sourceType: typeNames[source],
				targetType: typeNames[target],
				sourceIndex: source,
				targetIndex: target,
				peakLagMs,
				peakLagLabel: msToReadableLabel(peakLagMs),
				massTimeMs,
				massTimeLabel: msToReadableLabel(massTimeMs),
				peakEffect,
				integratedEffect,
				hazardRatioAtPeak: Math.exp(peakEffect),
				hazardRatioAt15m: Math.exp(effect15m),
				hazardRatioAt1h: Math.exp(effect1h),
				hazardRatioAt6h: Math.exp(effect6h),
				direction,
				strength,
				selectionFreq,
				supportSource: eventCountsByType[source],
				supportTarget: eventCountsByType[target],
				regimeSpecific,
				qualityFlags
			})
		}
	}

	edges.sort((a, b) => b.strength - a.strength)
	return edges
}

export function extractRhythms (
	binnedData: BinnedData,
	fitResult: FitResult
): BaselineSummary[] {
	const { numTypes, typeNames } = binnedData
	const { params, gamma } = fitResult
	const R = params.hmm.R
	const T = gamma.length / R
	const _P = params.P

	const summaries: BaselineSummary[] = []
	const config = DEFAULT_BASELINE_CONFIG

	for (let k = 0; k < numTypes; k++) {
		const aggregatedBeta = aggregateAcrossRegimes(
			params, gamma, T,
			r => getBaselineCoeffs(params, k, r)
		)

		const coeffs = extractFourierCoefficients(aggregatedBeta, config)
		const peaks = computeRhythmPeaks(coeffs)

		summaries.push({
			typeName: typeNames[k],
			typeIndex: k,
			interceptLogRate: coeffs.intercept,
			hourPeakTime: peaks.hourPeak,
			hourAmplitude: peaks.hourAmplitude,
			dowPeakDay: peaks.dayPeak,
			dowAmplitude: peaks.dayAmplitude
		})
	}

	return summaries
}

export function extractMotifSummaries (
	binnedData: BinnedData,
	motifSet: MotifSet,
	fitResult: FitResult,
	stability: StabilityResult | null,
	config: PipelineConfig['thresholds']
): MotifSummary[] {
	const { typeNames, numTypes } = binnedData
	const { motifs, M } = motifSet
	const { params, gamma } = fitResult
	const R = params.hmm.R
	const T = gamma.length / R

	if (M === 0) { return [] }

	const summaries: MotifSummary[] = []
	const occupancy = computeAverageOccupancy(gamma, R, T)

	for (let m = 0; m < M; m++) {
		const motif = motifs[m]

		let totalWeight = 0
		for (let k = 0; k < numTypes; k++) {
			for (let r = 0; r < R; r++) {
				const weight = params.coefficients[r].motifWeights[k * M + m]
				totalWeight += occupancy[r] * weight
			}
		}

		if (Math.abs(totalWeight) < config.minEffectAbs) { continue }

		let selectionFreq = 1.0
		if (stability) {
			selectionFreq = stability.motifFrequencies[m]
		}

		const qualityFlags: string[] = []
		if (selectionFreq < config.minSelectionFreq) {
			qualityFlags.push('unstable')
		}
		if (motif.support < config.minPairSupport) {
			qualityFlags.push('low_support')
		}

		summaries.push({
			motif,
			typeNames: motif.typeIndices.map(i => typeNames[i]),
			effectSize: totalWeight,
			hazardRatio: Math.exp(totalWeight),
			support: motif.support,
			selectionFreq,
			qualityFlags
		})
	}

	summaries.sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
	return summaries
}

function formatTime (hour: number): string {
	const h = Math.floor(hour)
	const m = Math.round((hour - h) * 60)
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function dayName (dow: number): string {
	const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
	const idx = ((Math.round(dow) % 7) + 7) % 7
	return names[idx]
}

export function generateInsights (
	edges: InfluenceEdge[],
	rhythms: BaselineSummary[],
	motifSummaries: MotifSummary[],
	maxInsights: number = 20
): ContinuousInsight[] {
	const insights: ContinuousInsight[] = []
	let id = 0

	const goodEdges = edges.filter(e => !e.qualityFlags.includes('no_ll_gain'))

	for (const edge of goodEdges.slice(0, Math.floor(maxInsights * 0.5))) {
		if (edge.direction === 'neutral') { continue }

		const hrStr = edge.hazardRatioAt1h.toFixed(2)
		const dirWord = edge.direction === 'excite' ? 'increases' : 'decreases'
		const isCoOccurrence = edge.massTimeMs < 15 * 60 * 1000

		if (isCoOccurrence) {
			insights.push({
				id: `co-${id++}`,
				type: 'co-occurrence',
				title: `${edge.sourceType} ↔ ${edge.targetType}`,
				description: `${edge.sourceType} and ${edge.targetType} tend to occur together (HR@1h=${hrStr})`,
				effectSize: edge.hazardRatioAt1h,
				peakLag: edge.massTimeLabel,
				confidence: edge.strength * edge.selectionFreq,
				support: Math.min(edge.supportSource, edge.supportTarget),
				metadata: {
					sourceType: edge.sourceType,
					targetType: edge.targetType,
					integratedEffect: edge.integratedEffect,
					qualityFlags: edge.qualityFlags
				}
			})
		} else {
			insights.push({
				id: `inf-${id++}`,
				type: 'influence',
				title: `${edge.sourceType} → ${edge.targetType}`,
				description: `${edge.sourceType} ${dirWord} ${edge.targetType} by ${hrStr}x within ${edge.peakLagLabel}`,
				effectSize: edge.hazardRatioAtPeak,
				peakLag: edge.peakLagLabel,
				confidence: edge.strength * edge.selectionFreq,
				support: Math.min(edge.supportSource, edge.supportTarget),
				metadata: {
					sourceType: edge.sourceType,
					targetType: edge.targetType,
					direction: edge.direction,
					integratedEffect: edge.integratedEffect,
					qualityFlags: edge.qualityFlags
				}
			})
		}
	}

	const strongRhythms = rhythms.filter(r => r.hourAmplitude > 0.3 || r.dowAmplitude > 0.2)
	for (const rhythm of strongRhythms.slice(0, Math.floor(maxInsights * 0.3))) {
		let description: string

		if (rhythm.hourAmplitude > rhythm.dowAmplitude) {
			const peakTimeStr = formatTime(rhythm.hourPeakTime)
			description = `${rhythm.typeName} peaks around ${peakTimeStr} daily`
		} else {
			const peakDay = dayName(rhythm.dowPeakDay)
			description = `${rhythm.typeName} peaks on ${peakDay}s`
		}

		insights.push({
			id: `rhy-${id++}`,
			type: 'rhythm',
			title: `${rhythm.typeName} rhythm`,
			description,
			effectSize: Math.max(rhythm.hourAmplitude, rhythm.dowAmplitude),
			peakLag: rhythm.hourAmplitude > rhythm.dowAmplitude
				? formatTime(rhythm.hourPeakTime)
				: dayName(rhythm.dowPeakDay),
			confidence: Math.min(rhythm.hourAmplitude + rhythm.dowAmplitude, 1),
			support: 0,
			metadata: {
				hourPeak: rhythm.hourPeakTime,
				hourAmplitude: rhythm.hourAmplitude,
				dayPeak: rhythm.dowPeakDay,
				dayAmplitude: rhythm.dowAmplitude
			}
		})
	}

	const goodMotifs = motifSummaries.filter(m => !m.qualityFlags.includes('unstable'))
	for (const motif of goodMotifs.slice(0, Math.floor(maxInsights * 0.2))) {
		const names = motif.typeNames
		const title = names.length === 2
			? `${names[0]} → ${names[1]} pattern`
			: `${names.join(' → ')} chain`

		const hrStr = motif.hazardRatio.toFixed(2)
		const description = `${title} appears ${motif.support} times (HR=${hrStr})`

		insights.push({
			id: `mot-${id++}`,
			type: 'motif',
			title,
			description,
			effectSize: motif.hazardRatio,
			peakLag: '',
			confidence: motif.selectionFreq,
			support: motif.support,
			metadata: {
				motifType: motif.motif.type,
				typeIndices: motif.motif.typeIndices,
				qualityFlags: motif.qualityFlags
			}
		})
	}

	insights.sort((a, b) => b.confidence - a.confidence)
	return insights.slice(0, maxInsights)
}
