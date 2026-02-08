import type { BinnedData, BaselineDesign } from './types'

const TWO_PI = 2 * Math.PI

export interface BaselineConfig {
	includeIntercept: boolean
	dailyHarmonics: number
	weeklyHarmonics: number
	includeGlobalActivity: boolean
	activityLagHours: number[]
}

export const DEFAULT_BASELINE_CONFIG: BaselineConfig = {
	includeIntercept: true,
	dailyHarmonics: 2,
	weeklyHarmonics: 1,
	includeGlobalActivity: false,
	activityLagHours: []
}

export function countBaselineFeatures (config: BaselineConfig): number {
	let P = 0
	if (config.includeIntercept) {
		P += 1
	}
	P += config.dailyHarmonics * 2
	P += config.weeklyHarmonics * 2
	P += config.activityLagHours.length
	return P
}

export function buildBaselineMatrix (
	binnedData: BinnedData,
	config: BaselineConfig = DEFAULT_BASELINE_CONFIG
): BaselineDesign {
	const { T, binStartMs } = binnedData
	const P = countBaselineFeatures(config)

	const X = new Float32Array(T * P)

	for (let t = 0; t < T; t++) {
		const date = new Date(binStartMs[t])
		const hourOfDay = date.getUTCHours() + date.getUTCMinutes() / 60
		const dayOfWeek = date.getUTCDay()

		let featureIdx = 0
		const rowOffset = t * P

		if (config.includeIntercept) {
			X[rowOffset + featureIdx] = 1
			featureIdx++
		}

		for (let h = 1; h <= config.dailyHarmonics; h++) {
			const angle = (TWO_PI * h * hourOfDay) / 24
			X[rowOffset + featureIdx] = Math.sin(angle)
			featureIdx++
			X[rowOffset + featureIdx] = Math.cos(angle)
			featureIdx++
		}

		for (let h = 1; h <= config.weeklyHarmonics; h++) {
			const angle = (TWO_PI * h * dayOfWeek) / 7
			X[rowOffset + featureIdx] = Math.sin(angle)
			featureIdx++
			X[rowOffset + featureIdx] = Math.cos(angle)
			featureIdx++
		}
	}

	if (config.includeGlobalActivity && config.activityLagHours.length > 0) {
		addGlobalActivityFeatures(X, binnedData, config, P)
	}

	return { P, X }
}

function addGlobalActivityFeatures (
	X: Float32Array,
	binnedData: BinnedData,
	config: BaselineConfig,
	P: number
): void {
	const { T, numTypes, y, binStartMs } = binnedData
	const baseIdx = 1 + config.dailyHarmonics * 2 + config.weeklyHarmonics * 2

	const totalCounts = new Float32Array(T)
	for (let t = 0; t < T; t++) {
		let sum = 0
		for (let k = 0; k < numTypes; k++) {
			sum += y[t * numTypes + k]
		}
		totalCounts[t] = sum
	}

	for (let lagIdx = 0; lagIdx < config.activityLagHours.length; lagIdx++) {
		const lagMs = config.activityLagHours[lagIdx] * 60 * 60 * 1000

		for (let t = 0; t < T; t++) {
			const targetTime = binStartMs[t] - lagMs
			let count = 0

			for (let s = t - 1; s >= 0; s--) {
				if (binStartMs[s] < targetTime) {
					break
				}
				count += totalCounts[s]
			}

			X[t * P + baseIdx + lagIdx] = Math.log1p(count)
		}
	}
}

export function extractFourierCoefficients (
	beta: Float32Array,
	config: BaselineConfig
): { intercept: number; daily: Array<{ sin: number; cos: number }>; weekly: Array<{ sin: number; cos: number }> } {
	let idx = 0
	const intercept = config.includeIntercept ? beta[idx++] : 0

	const daily: Array<{ sin: number; cos: number }> = []
	for (let h = 0; h < config.dailyHarmonics; h++) {
		daily.push({ sin: beta[idx++], cos: beta[idx++] })
	}

	const weekly: Array<{ sin: number; cos: number }> = []
	for (let h = 0; h < config.weeklyHarmonics; h++) {
		weekly.push({ sin: beta[idx++], cos: beta[idx++] })
	}

	return { intercept, daily, weekly }
}

export function computeRhythmPeaks (
	coeffs: ReturnType<typeof extractFourierCoefficients>
): { hourPeak: number; hourAmplitude: number; dayPeak: number; dayAmplitude: number } {
	let hourPeak = 12
	let hourAmplitude = 0

	if (coeffs.daily.length > 0) {
		const { sin, cos } = coeffs.daily[0]
		hourAmplitude = Math.sqrt(sin * sin + cos * cos)
		const phase = Math.atan2(sin, cos)
		hourPeak = (24 - (phase * 24) / TWO_PI) % 24
		if (hourPeak < 0) {
			hourPeak += 24
		}
	}

	let dayPeak = 0
	let dayAmplitude = 0

	if (coeffs.weekly.length > 0) {
		const { sin, cos } = coeffs.weekly[0]
		dayAmplitude = Math.sqrt(sin * sin + cos * cos)
		const phase = Math.atan2(sin, cos)
		dayPeak = Math.round((7 - (phase * 7) / TWO_PI) % 7)
		if (dayPeak < 0) {
			dayPeak += 7
		}
	}

	return { hourPeak, hourAmplitude, dayPeak, dayAmplitude }
}
