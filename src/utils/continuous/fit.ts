import { MS_PER_HOUR } from './basis'
import { NUM_BASELINE_FEATURES } from './features'
import type { ObservationWindow, EventStream } from './observationWindows'
import type { PPGLMParams } from './ppglm'
import { initParamsFromData, computeLogLikelihood } from './ppglm'

function clampFinite (x: number): number {
	if (!Number.isFinite(x)) { return 0 }
	return Math.max(-50, Math.min(50, x))
}

export interface FitOptions {
	maxIter: number
	learningRate: number
	lambda1: number
	lambda2: number
	tolerance: number
	verbose: boolean
}

const DEFAULT_OPTIONS: FitOptions = {
	maxIter: 200,
	learningRate: 0.01,
	lambda1: 0.01,
	lambda2: 0.001,
	tolerance: 1e-6,
	verbose: false
}

export interface FitResult {
	params: PPGLMParams
	logLik: number
	converged: boolean
	iterations: number
}

export function fitTargetType (
	stream: EventStream,
	windows: ObservationWindow[],
	targetType: number,
	numBases: number,
	options: Partial<FitOptions> = {},
	countsByType?: number[],
	totalObservedHours?: number
): FitResult {
	const opts = { ...DEFAULT_OPTIONS, ...options }
	const numTypes = stream.typeNames.length

	let params: PPGLMParams
	if (countsByType !== undefined && totalObservedHours !== undefined) {
		params = initParamsFromData(numTypes, numBases, countsByType, totalObservedHours)
	} else {
		const counts = computeCountsByType(stream, numTypes)
		const hours = computeTotalObservedHours(windows)
		params = initParamsFromData(numTypes, numBases, counts, hours)
	}

	let prevLogLik = -Infinity
	let converged = false
	let iter = 0

	const m_beta = new Float64Array(numTypes * NUM_BASELINE_FEATURES)
	const v_beta = new Float64Array(numTypes * NUM_BASELINE_FEATURES)
	const m_theta: Float64Array[] = []
	const v_theta: Float64Array[] = []
	for (let k = 0; k < numTypes; k++) {
		m_theta.push(new Float64Array(numTypes * numBases))
		v_theta.push(new Float64Array(numTypes * numBases))
	}

	const beta1 = 0.9
	const beta2 = 0.999
	const eps = 1e-8

	for (iter = 0; iter < opts.maxIter; iter++) {
		const result = computeLogLikelihood(
			params,
			stream,
			windows,
			targetType,
			opts.lambda1,
			opts.lambda2
		)

		if (opts.verbose && iter % 10 === 0) {
			console.log(`Iter ${iter}: logLik = ${result.logLik.toFixed(4)}`)
		}

		if (Math.abs(result.logLik - prevLogLik) < opts.tolerance) {
			converged = true
			break
		}
		prevLogLik = result.logLik

		const t = iter + 1
		for (let j = 0; j < params.beta.length; j++) {
			m_beta[j] = beta1 * m_beta[j] + (1 - beta1) * result.gradient.beta[j]
			v_beta[j] = beta2 * v_beta[j] + (1 - beta2) * result.gradient.beta[j] ** 2
			const mHat = m_beta[j] / (1 - beta1 ** t)
			const vHat = v_beta[j] / (1 - beta2 ** t)
			const update = opts.learningRate * mHat / (Math.sqrt(vHat) + eps)
			params.beta[j] = clampFinite(params.beta[j] + update)
		}

		for (let src = 0; src < numTypes; src++) {
			if (src === targetType) { continue }
			for (let b = 0; b < numBases; b++) {
				const idx = src * numBases + b
				const g = result.gradient.theta[targetType][idx]
				m_theta[targetType][idx] = beta1 * m_theta[targetType][idx] + (1 - beta1) * g
				v_theta[targetType][idx] = beta2 * v_theta[targetType][idx] + (1 - beta2) * g ** 2
				const mHat = m_theta[targetType][idx] / (1 - beta1 ** t)
				const vHat = v_theta[targetType][idx] / (1 - beta2 ** t)
				const update = opts.learningRate * mHat / (Math.sqrt(vHat) + eps)
				params.theta[targetType][idx] = clampFinite(params.theta[targetType][idx] + update)
			}
		}
	}

	const finalResult = computeLogLikelihood(
		params,
		stream,
		windows,
		targetType,
		opts.lambda1,
		opts.lambda2
	)

	return {
		params,
		logLik: finalResult.logLik,
		converged,
		iterations: iter
	}
}

export interface FullModelFit {
	params: PPGLMParams
	targetResults: Map<number, FitResult>
	typeNames: string[]
}

export type ProgressCallback = (stage: string, percent: number, detail?: string) => void

function computeCountsByType (stream: EventStream, numTypes: number): number[] {
	const counts = new Array<number>(numTypes).fill(0)
	for (const typeName of stream.types) {
		const idx = stream.typeIndex.get(typeName)
		if (idx !== undefined) {
			counts[idx]++
		}
	}
	return counts
}

function computeTotalObservedHours (windows: ObservationWindow[]): number {
	let totalMs = 0
	for (const w of windows) {
		totalMs += w.endMs - w.startMs
	}
	return totalMs / MS_PER_HOUR
}

export async function fitFullModel (
	stream: EventStream,
	windows: ObservationWindow[],
	numBases: number = 6,
	options: Partial<FitOptions> = {},
	onProgress?: ProgressCallback,
	translations?: Record<string, string>
): Promise<FullModelFit> {
	const numTypes = stream.typeNames.length
	const countsByType = computeCountsByType(stream, numTypes)
	const totalObservedHours = computeTotalObservedHours(windows)
	const params = initParamsFromData(numTypes, numBases, countsByType, totalObservedHours)
	const targetResults = new Map<number, FitResult>()

	const eligibleTypes: number[] = []
	for (let k = 0; k < numTypes; k++) {
		if (countsByType[k] >= 10) {
			eligibleTypes.push(k)
		}
	}

	for (let i = 0; i < eligibleTypes.length; i++) {
		const k = eligibleTypes[i]
		const typeName = stream.typeNames[k]
		const translatedName = translations?.[typeName] ?? typeName
		const percent = Math.round((i / eligibleTypes.length) * 100)
		onProgress?.('Fitting model', percent, `Fitting ${translatedName} (${i + 1}/${eligibleTypes.length})`)

		await new Promise(resolve => setTimeout(resolve, 0))

		const result = fitTargetType(stream, windows, k, numBases, options, countsByType, totalObservedHours)
		targetResults.set(k, result)

		for (let j = 0; j < NUM_BASELINE_FEATURES; j++) {
			params.beta[k * NUM_BASELINE_FEATURES + j] = result.params.beta[k * NUM_BASELINE_FEATURES + j]
		}
		for (let src = 0; src < numTypes; src++) {
			for (let b = 0; b < numBases; b++) {
				params.theta[k][src * numBases + b] = result.params.theta[k][src * numBases + b]
			}
		}
	}

	onProgress?.('Fitting model', 100, 'Complete')

	return {
		params,
		targetResults,
		typeNames: stream.typeNames
	}
}

export function extractInfluenceWeights (
	fit: FullModelFit,
	sourceType: number,
	targetType: number
): Float64Array {
	const { params } = fit
	const numBases = params.numBases
	const weights = new Float64Array(numBases)

	for (let b = 0; b < numBases; b++) {
		weights[b] = params.theta[targetType][sourceType * numBases + b]
	}

	return weights
}
