import {
	createExponentialBasis,
	initRecursiveState,
	advanceStateDecayOnly,
	incrementState,
	MS_PER_HOUR
} from './basis'
import {
	NUM_BASELINE_FEATURES,
	baselineFeatureVector,
	intensity
} from './features'
import type { ObservationWindow, EventStream } from './observationWindows'

export interface PPGLMParams {
	numTypes: number
	numBases: number
	beta: Float64Array
	theta: Float64Array[]
}

export function initParams (numTypes: number, numBases: number): PPGLMParams {
	const betaSize = numTypes * NUM_BASELINE_FEATURES
	const thetaSize = numTypes * numBases

	const beta = new Float64Array(betaSize)
	const theta: Float64Array[] = []
	for (let k = 0; k < numTypes; k++) {
		theta.push(new Float64Array(thetaSize))
	}

	return { numTypes, numBases, beta, theta }
}

export function initParamsFromData (
	numTypes: number,
	numBases: number,
	countsByType: number[],
	totalObservedHours: number
): PPGLMParams {
	const params = initParams(numTypes, numBases)

	for (let k = 0; k < numTypes; k++) {
		const count = countsByType[k] ?? 0
		const rate = (count + 0.5) / Math.max(totalObservedHours, 1e-6)
		params.beta[k * NUM_BASELINE_FEATURES] = Math.log(rate)
	}

	return params
}

export interface LikelihoodResult {
	logLik: number
	gradient: {
		beta: Float64Array
		theta: Float64Array[]
	}
}

interface TimePoint {
	timeHours: number
	timeMs: number
	isEvent: boolean
	eventType: number
	isQuadLeft: boolean
	windowIdx: number
	dt?: number
}

function buildTimePoints (
	stream: EventStream,
	windows: ObservationWindow[],
	numQuadPoints: number
): TimePoint[] {
	const points: TimePoint[] = []

	for (let i = 0; i < stream.times.length; i++) {
		const tMs = stream.times[i]
		const typeIdx = stream.typeIndex.get(stream.types[i])
		if (typeIdx === undefined) { continue }
		points.push({
			timeHours: tMs / MS_PER_HOUR,
			timeMs: tMs,
			isEvent: true,
			eventType: typeIdx,
			isQuadLeft: false,
			windowIdx: -1
		})
	}

	for (let w = 0; w < windows.length; w++) {
		const win = windows[w]
		const dt = (win.endMs - win.startMs) / numQuadPoints
		for (let q = 0; q < numQuadPoints; q++) {
			const tLeftMs = win.startMs + q * dt
			points.push({
				timeHours: tLeftMs / MS_PER_HOUR,
				timeMs: tLeftMs,
				isEvent: false,
				eventType: -1,
				isQuadLeft: true,
				windowIdx: w,
				dt: dt / MS_PER_HOUR
			})
		}
	}

	points.sort((a, b) => {
		if (a.timeHours !== b.timeHours) { return a.timeHours - b.timeHours }
		if (a.isQuadLeft !== b.isQuadLeft) { return a.isQuadLeft ? -1 : 1 }
		return 0
	})

	return points
}

function computeEta (
	params: PPGLMParams,
	targetType: number,
	baselineF: Float64Array,
	historyS: Float64Array[],
	numBases: number
): number {
	const { numTypes, beta, theta } = params
	let eta = 0

	for (let j = 0; j < NUM_BASELINE_FEATURES; j++) {
		eta += beta[targetType * NUM_BASELINE_FEATURES + j] * baselineF[j]
	}

	for (let src = 0; src < numTypes; src++) {
		if (src === targetType) { continue }
		for (let b = 0; b < numBases; b++) {
			eta += theta[targetType][src * numBases + b] * historyS[src][b]
		}
	}

	return eta
}

export function computeLogLikelihood (
	params: PPGLMParams,
	stream: EventStream,
	windows: ObservationWindow[],
	targetType: number,
	lambda1: number = 0.01,
	lambda2: number = 0.001
): LikelihoodResult {
	const { numTypes, numBases } = params
	const basis = createExponentialBasis()
	const taus = basis.taus.slice(0, numBases)
	const numQuadPoints = 50

	const betaGrad = new Float64Array(numTypes * NUM_BASELINE_FEATURES)
	const thetaGrad: Float64Array[] = []
	for (let k = 0; k < numTypes; k++) {
		thetaGrad.push(new Float64Array(numTypes * numBases))
	}

	let logLik = 0
	const state = initRecursiveState(numTypes, numBases)
	const points = buildTimePoints(stream, windows, numQuadPoints)

	let i = 0
	while (i < points.length) {
		const currentTime = points[i].timeHours
		advanceStateDecayOnly(state, taus, currentTime)

		const groupEnd = findGroupEnd(points, i, currentTime)

		for (let j = i; j < groupEnd; j++) {
			const pt = points[j]

			if (pt.isQuadLeft && pt.dt !== undefined) {
				const baselineF = baselineFeatureVector(pt.timeMs)
				const eta = computeEta(params, targetType, baselineF, state.S, numBases)
				const lam = intensity(eta)

				logLik -= lam * pt.dt

				for (let f = 0; f < NUM_BASELINE_FEATURES; f++) {
					betaGrad[targetType * NUM_BASELINE_FEATURES + f] -= lam * baselineF[f] * pt.dt
				}
				for (let src = 0; src < numTypes; src++) {
					if (src === targetType) { continue }
					for (let b = 0; b < numBases; b++) {
						thetaGrad[targetType][src * numBases + b] -= lam * state.S[src][b] * pt.dt
					}
				}
			}
		}

		for (let j = i; j < groupEnd; j++) {
			const pt = points[j]

			if (pt.isEvent && pt.eventType === targetType) {
				const baselineF = baselineFeatureVector(pt.timeMs)
				const eta = computeEta(params, targetType, baselineF, state.S, numBases)
				const clampedEta = Math.max(-20, Math.min(20, eta))

				logLik += clampedEta

				for (let f = 0; f < NUM_BASELINE_FEATURES; f++) {
					betaGrad[targetType * NUM_BASELINE_FEATURES + f] += baselineF[f]
				}
				for (let src = 0; src < numTypes; src++) {
					if (src === targetType) { continue }
					for (let b = 0; b < numBases; b++) {
						thetaGrad[targetType][src * numBases + b] += state.S[src][b]
					}
				}
			}
		}

		for (let j = i; j < groupEnd; j++) {
			const pt = points[j]
			if (pt.isEvent) {
				incrementState(state, pt.eventType)
			}
		}

		i = groupEnd
	}

	for (let src = 0; src < numTypes; src++) {
		if (src === targetType) { continue }
		for (let b = 0; b < numBases; b++) {
			const w = params.theta[targetType][src * numBases + b]
			logLik -= lambda1 * Math.abs(w) + lambda2 * w * w
			thetaGrad[targetType][src * numBases + b] -= lambda1 * Math.sign(w) + 2 * lambda2 * w
		}
	}

	return { logLik, gradient: { beta: betaGrad, theta: thetaGrad } }
}

function findGroupEnd (points: TimePoint[], start: number, targetTime: number): number {
	let end = start
	while (end < points.length && points[end].timeHours === targetTime) {
		end++
	}
	return end
}

export function computeIntensityAt (
	params: PPGLMParams,
	stream: EventStream,
	targetType: number,
	timeMs: number
): number {
	const { numTypes, numBases } = params
	const basis = createExponentialBasis()
	const taus = basis.taus.slice(0, numBases)

	const state = initRecursiveState(numTypes, numBases)
	const targetTimeHours = timeMs / MS_PER_HOUR

	for (let i = 0; i < stream.times.length && stream.times[i] < timeMs; i++) {
		const tMs = stream.times[i]
		const typeIdx = stream.typeIndex.get(stream.types[i])
		if (typeIdx === undefined) { continue }

		advanceStateDecayOnly(state, taus, tMs / MS_PER_HOUR)
		incrementState(state, typeIdx)
	}
	advanceStateDecayOnly(state, taus, targetTimeHours)

	const baselineF = baselineFeatureVector(timeMs)
	const eta = computeEta(params, targetType, baselineF, state.S, numBases)

	return intensity(eta)
}
