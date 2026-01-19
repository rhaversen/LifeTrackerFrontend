export const MS_PER_HOUR = 3600000

export interface ExponentialBasis {
	taus: number[]
	labels: string[]
}

export function createExponentialBasis (): ExponentialBasis {
	const taus = [
		5 / 60,
		15 / 60,
		1,
		4,
		12,
		24,
		3 * 24,
		7 * 24,
		21 * 24
	]

	const labels = ['5m', '15m', '1h', '4h', '12h', '1d', '3d', '7d', '21d']

	return { taus, labels }
}

export function exponentialKernel (tauHours: number, lagHours: number): number {
	if (lagHours <= 0) { return 0 }
	return Math.exp(-lagHours / tauHours)
}

export function decayFactor (dtHours: number, tauHours: number): number {
	return Math.exp(-dtHours / tauHours)
}

export interface RecursiveState {
	S: Float64Array[]
	lastTimeHours: number
}

export function initRecursiveState (numTypes: number, numBases: number): RecursiveState {
	const S: Float64Array[] = []
	for (let i = 0; i < numTypes; i++) {
		S.push(new Float64Array(numBases))
	}
	return { S, lastTimeHours: -Infinity }
}

export function advanceStateDecayOnly (
	state: RecursiveState,
	taus: number[],
	newTimeHours: number
): void {
	const dt = newTimeHours - state.lastTimeHours
	if (dt > 0 && isFinite(state.lastTimeHours)) {
		for (let i = 0; i < state.S.length; i++) {
			for (let b = 0; b < taus.length; b++) {
				state.S[i][b] *= decayFactor(dt, taus[b])
			}
		}
	}
	state.lastTimeHours = newTimeHours
}

export function incrementState (
	state: RecursiveState,
	eventType: number,
	count: number = 1
): void {
	if (eventType >= 0 && eventType < state.S.length) {
		for (let b = 0; b < state.S[eventType].length; b++) {
			state.S[eventType][b] += count
		}
	}
}

export function cloneState (state: RecursiveState): RecursiveState {
	return {
		S: state.S.map(s => s.slice()),
		lastTimeHours: state.lastTimeHours
	}
}

export function getHistoryFeatures (state: RecursiveState, sourceType: number): Float64Array {
	return state.S[sourceType]
}

export function evaluateInfluenceCurve (
	theta: Float64Array,
	taus: number[],
	lagHours: number
): number {
	let g = 0
	for (let b = 0; b < taus.length; b++) {
		g += theta[b] * exponentialKernel(taus[b], lagHours)
	}
	return g
}

export function findPeakLag (
	theta: Float64Array,
	taus: number[],
	maxLagHours: number = 7 * 24,
	resolution: number = 200
): { peakLagMs: number; peakValue: number } {
	const minLagHours = 5 / 60

	let peakLagHours = minLagHours
	let peakValue = evaluateInfluenceCurve(theta, taus, minLagHours)
	let peakAbs = Math.abs(peakValue)

	const ratio = maxLagHours / minLagHours
	for (let i = 0; i < resolution; i++) {
		const frac = i / Math.max(1, resolution - 1)
		const lagHours = minLagHours * Math.pow(ratio, frac)

		const g = evaluateInfluenceCurve(theta, taus, lagHours)
		const abs = Math.abs(g)
		if (abs > peakAbs) {
			peakAbs = abs
			peakLagHours = lagHours
			peakValue = g
		}
	}

	return { peakLagMs: peakLagHours * MS_PER_HOUR, peakValue }
}

export function findMassTime (
	theta: Float64Array,
	taus: number[],
	fraction: number = 0.5,
	maxLagHours: number = 7 * 24,
	resolution: number = 500
): { massTimeMs: number; totalIntegral: number } {
	const totalIntegral = integratedEffect(theta, taus, maxLagHours)
	if (Math.abs(totalIntegral) < 1e-10) {
		return { massTimeMs: 0, totalIntegral: 0 }
	}

	const targetIntegral = Math.abs(totalIntegral) * fraction
	let cumulative = 0
	const minLagHours = 1 / 60
	const ratio = maxLagHours / minLagHours

	for (let i = 0; i < resolution; i++) {
		const frac = i / Math.max(1, resolution - 1)
		const lagHours = minLagHours * Math.pow(ratio, frac)
		const nextFrac = (i + 1) / Math.max(1, resolution - 1)
		const nextLagHours = minLagHours * Math.pow(ratio, nextFrac)
		const dt = nextLagHours - lagHours

		const g = evaluateInfluenceCurve(theta, taus, lagHours)
		cumulative += Math.abs(g) * dt

		if (cumulative >= targetIntegral) {
			return { massTimeMs: lagHours * MS_PER_HOUR, totalIntegral }
		}
	}

	return { massTimeMs: maxLagHours * MS_PER_HOUR, totalIntegral }
}

export function integratedEffect (
	theta: Float64Array,
	taus: number[],
	maxLagHours: number = 7 * 24
): number {
	let integral = 0
	for (let b = 0; b < taus.length; b++) {
		integral += theta[b] * taus[b] * (1 - Math.exp(-maxLagHours / taus[b]))
	}
	return integral
}

export function integrateExponentialBasis (
	tauHours: number,
	dtHours: number,
	state0: number
): number {
	if (dtHours <= 0) { return 0 }
	return state0 * tauHours * (1 - Math.exp(-dtHours / tauHours))
}
