export interface BaselineFeatures {
	hourSin: number
	hourCos: number
	hour2Sin: number
	hour2Cos: number
	dowSin: number
	dowCos: number
}

export function computeBaselineFeatures (timeMs: number): BaselineFeatures {
	const date = new Date(timeMs)
	const hourOfDay = date.getUTCHours() + date.getUTCMinutes() / 60
	const dayOfWeek = date.getUTCDay()

	const hourRadians = (2 * Math.PI * hourOfDay) / 24
	const hour2Radians = (4 * Math.PI * hourOfDay) / 24
	const dowRadians = (2 * Math.PI * dayOfWeek) / 7

	return {
		hourSin: Math.sin(hourRadians),
		hourCos: Math.cos(hourRadians),
		hour2Sin: Math.sin(hour2Radians),
		hour2Cos: Math.cos(hour2Radians),
		dowSin: Math.sin(dowRadians),
		dowCos: Math.cos(dowRadians)
	}
}

export function baselineFeatureVector (timeMs: number): Float64Array {
	const f = computeBaselineFeatures(timeMs)
	return new Float64Array([
		1,
		f.hourSin, f.hourCos,
		f.hour2Sin, f.hour2Cos,
		f.dowSin, f.dowCos
	])
}

export const NUM_BASELINE_FEATURES = 7

export interface FeatureVector {
	baseline: Float64Array
	history: Float64Array[]
}

export function buildFeatureVector (
	timeMs: number,
	historyStates: Float64Array[],
	numBases: number
): FeatureVector {
	return {
		baseline: baselineFeatureVector(timeMs),
		history: historyStates.map(s => s.slice(0, numBases))
	}
}

export function computeLinearPredictor (
	features: FeatureVector,
	beta: Float64Array,
	theta: Float64Array[],
	targetType: number,
	numTypes: number,
	numBases: number
): number {
	let eta = 0

	for (let j = 0; j < NUM_BASELINE_FEATURES; j++) {
		eta += beta[targetType * NUM_BASELINE_FEATURES + j] * features.baseline[j]
	}

	const thetaRow = theta[targetType]
	if (thetaRow === undefined) { return eta }

	for (let i = 0; i < numTypes; i++) {
		if (i === targetType) { continue }
		const histRow = features.history[i]
		if (histRow === undefined) { continue }
		for (let b = 0; b < numBases; b++) {
			const histVal: number = histRow[b] ?? 0
			const thetaVal: number = thetaRow[i * numBases + b] ?? 0
			eta += thetaVal * histVal
		}
	}

	return eta
}

export function intensity (eta: number): number {
	return Math.exp(Math.max(-20, Math.min(20, eta)))
}
