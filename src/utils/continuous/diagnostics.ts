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
import type { EventStream, ObservationWindow } from './observationWindows'
import type { PPGLMParams } from './ppglm'

export interface DiagnosticResult {
	ksStatistic: number
	ksPassesAt05: boolean
	transformedTimes: number[]
	expectedIntervals: number[]
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

interface IntegrationSegment {
	startMs: number
	endMs: number
	windowIdx: number
}

function getValidSegments (
	prevEventMs: number,
	currEventMs: number,
	windows: ObservationWindow[]
): IntegrationSegment[] {
	const segments: IntegrationSegment[] = []

	for (let w = 0; w < windows.length; w++) {
		const win = windows[w]
		const segStart = Math.max(prevEventMs, win.startMs)
		const segEnd = Math.min(currEventMs, win.endMs)

		if (segStart < segEnd) {
			segments.push({ startMs: segStart, endMs: segEnd, windowIdx: w })
		}
	}

	return segments
}

export function timeRescalingDiagnostic (
	params: PPGLMParams,
	stream: EventStream,
	windows: ObservationWindow[],
	targetType: number
): DiagnosticResult {
	const { numTypes, numBases } = params
	const basis = createExponentialBasis()
	const taus = basis.taus.slice(0, numBases)

	const targetIndices: number[] = []
	for (let i = 0; i < stream.times.length; i++) {
		if (stream.typeIndex.get(stream.types[i]) === targetType) {
			targetIndices.push(i)
		}
	}

	if (targetIndices.length < 10) {
		return {
			ksStatistic: 1,
			ksPassesAt05: false,
			transformedTimes: [],
			expectedIntervals: []
		}
	}

	const transformedTimes: number[] = []
	const state = initRecursiveState(numTypes, numBases)
	const numQuadPoints = 20

	let eventPtr = 0
	for (let idx = 0; idx < targetIndices.length; idx++) {
		const currTargetIdx = targetIndices[idx]
		const currEventMs = stream.times[currTargetIdx]

		if (idx > 0) {
			const prevTargetIdx = targetIndices[idx - 1]
			const prevEventMs = stream.times[prevTargetIdx]
			const segments = getValidSegments(prevEventMs, currEventMs, windows)

			let integral = 0

			for (const seg of segments) {
				const dtMs = (seg.endMs - seg.startMs) / numQuadPoints
				const dtHours = dtMs / MS_PER_HOUR

				for (let q = 0; q < numQuadPoints; q++) {
					const tMidMs = seg.startMs + (q + 0.5) * dtMs
					const tMidHours = tMidMs / MS_PER_HOUR

					while (eventPtr < stream.times.length && stream.times[eventPtr] < tMidMs) {
						const evtMs = stream.times[eventPtr]
						const evtType = stream.typeIndex.get(stream.types[eventPtr])
						if (evtType !== undefined) {
							advanceStateDecayOnly(state, taus, evtMs / MS_PER_HOUR)
							incrementState(state, evtType)
						}
						eventPtr++
					}
					advanceStateDecayOnly(state, taus, tMidHours)

					const baselineF = baselineFeatureVector(tMidMs)
					const eta = computeEta(params, targetType, baselineF, state.S, numBases)
					const lam = intensity(eta)
					integral += lam * dtHours
				}
			}

			transformedTimes.push(integral)
		}

		while (eventPtr <= currTargetIdx && eventPtr < stream.times.length) {
			const evtMs = stream.times[eventPtr]
			const evtType = stream.typeIndex.get(stream.types[eventPtr])
			if (evtType !== undefined) {
				advanceStateDecayOnly(state, taus, evtMs / MS_PER_HOUR)
				incrementState(state, evtType)
			}
			eventPtr++
		}
	}

	const n = transformedTimes.length
	const sortedTransformed = [...transformedTimes].sort((a, b) => a - b)

	let maxD = 0
	for (let i = 0; i < n; i++) {
		const empiricalCdf = (i + 1) / n
		const theoreticalCdf = 1 - Math.exp(-sortedTransformed[i])
		const d = Math.abs(empiricalCdf - theoreticalCdf)
		if (d > maxD) { maxD = d }
	}

	const criticalValue = 1.36 / Math.sqrt(n)
	const ksPassesAt05 = maxD < criticalValue

	const expectedIntervals = transformedTimes.map(() => 1)

	return {
		ksStatistic: maxD,
		ksPassesAt05,
		transformedTimes,
		expectedIntervals
	}
}

export interface HeldOutResult {
	trainLogLik: number
	testLogLik: number
	trainEvents: number
	testEvents: number
}

export function splitTrainTest (
	stream: EventStream,
	windows: ObservationWindow[],
	trainFraction: number = 0.7
): { trainStream: EventStream; testStream: EventStream; trainWindows: ObservationWindow[]; testWindows: ObservationWindow[] } {
	const totalMs = windows.reduce((sum, w) => sum + (w.endMs - w.startMs), 0)
	const trainMs = totalMs * trainFraction

	let cumMs = 0
	let splitIdx = 0
	for (let i = 0; i < windows.length; i++) {
		const wMs = windows[i].endMs - windows[i].startMs
		if (cumMs + wMs >= trainMs) {
			splitIdx = i
			break
		}
		cumMs += wMs
	}

	const trainWindows = windows.slice(0, splitIdx + 1)
	const testWindows = windows.slice(splitIdx + 1)

	const trainEndMs = trainWindows[trainWindows.length - 1]?.endMs ?? 0
	const trainTimes: number[] = []
	const trainTypes: string[] = []
	const testTimes: number[] = []
	const testTypes: string[] = []

	for (let i = 0; i < stream.times.length; i++) {
		if (stream.times[i] < trainEndMs) {
			trainTimes.push(stream.times[i])
			trainTypes.push(stream.types[i])
		} else {
			testTimes.push(stream.times[i])
			testTypes.push(stream.types[i])
		}
	}

	const trainStream: EventStream = {
		times: trainTimes,
		types: trainTypes,
		typeIndex: stream.typeIndex,
		typeNames: stream.typeNames
	}

	const testStream: EventStream = {
		times: testTimes,
		types: testTypes,
		typeIndex: stream.typeIndex,
		typeNames: stream.typeNames
	}

	return { trainStream, testStream, trainWindows, testWindows }
}

export function evaluateLogLikelihood (
	params: PPGLMParams,
	stream: EventStream,
	windows: ObservationWindow[],
	targetType: number
): number {
	const { numTypes, numBases } = params
	const basis = createExponentialBasis()
	const taus = basis.taus.slice(0, numBases)

	const targetIndices: number[] = []
	for (let i = 0; i < stream.times.length; i++) {
		if (stream.typeIndex.get(stream.types[i]) === targetType) {
			targetIndices.push(i)
		}
	}

	const state = initRecursiveState(numTypes, numBases)
	const numQuadPoints = 20

	let logLik = 0
	let eventPtr = 0

	const allEventsInWindows: number[] = []
	for (let i = 0; i < stream.times.length; i++) {
		const t = stream.times[i]
		for (const w of windows) {
			if (t >= w.startMs && t < w.endMs) {
				allEventsInWindows.push(i)
				break
			}
		}
	}

	let prevMs = windows.length > 0 ? windows[0].startMs : 0
	for (const evtIdx of allEventsInWindows) {
		const evtMs = stream.times[evtIdx]
		const evtType = stream.typeIndex.get(stream.types[evtIdx])
		if (evtType === undefined) { continue }

		const segments = getValidSegments(prevMs, evtMs, windows)
		for (const seg of segments) {
			const dtMs = (seg.endMs - seg.startMs) / numQuadPoints
			const dtHours = dtMs / MS_PER_HOUR

			for (let q = 0; q < numQuadPoints; q++) {
				const tMidMs = seg.startMs + (q + 0.5) * dtMs
				const tMidHours = tMidMs / MS_PER_HOUR

				while (eventPtr < stream.times.length && stream.times[eventPtr] < tMidMs) {
					const eMs = stream.times[eventPtr]
					const eType = stream.typeIndex.get(stream.types[eventPtr])
					if (eType !== undefined) {
						advanceStateDecayOnly(state, taus, eMs / MS_PER_HOUR)
						incrementState(state, eType)
					}
					eventPtr++
				}
				advanceStateDecayOnly(state, taus, tMidHours)

				const baselineF = baselineFeatureVector(tMidMs)
				const eta = computeEta(params, targetType, baselineF, state.S, numBases)
				const lam = intensity(eta)
				logLik -= lam * dtHours
			}
		}

		while (eventPtr <= evtIdx && eventPtr < stream.times.length) {
			const eMs = stream.times[eventPtr]
			const eType = stream.typeIndex.get(stream.types[eventPtr])
			if (eType !== undefined) {
				advanceStateDecayOnly(state, taus, eMs / MS_PER_HOUR)
				incrementState(state, eType)
			}
			eventPtr++
		}

		if (evtType === targetType) {
			const baselineF = baselineFeatureVector(evtMs)
			const eta = computeEta(params, targetType, baselineF, state.S, numBases)
			logLik += eta
		}

		prevMs = evtMs
	}

	return logLik
}
