import { forwardBackward, updateHMMParams, initializeHMMParams } from './hmm'
import {
	fitPoissonRegimeType,
	computeTotalLogEmission,
	initializeCoefficients,
	buildPoissonFitConfigFromPipeline,
	type PoissonFitConfig
} from './poissonSparse'
import { computeKernelByBin } from './basis'
import type {
	BinnedData,
	BaselineDesign,
	HistoryDesign,
	MotifSet,
	ModelParams,
	FitResult,
	RegimeCoefficients,
	ProgressCallback,
	PipelineConfig,
	ModelRuntime,
	LagBasis
} from './types'

export interface SwitchingModelConfig {
	R: number
	stickyPrior: number
	penalties: PipelineConfig['penalties']
	em: {
		maxIter: number
		tolerance: number
		maxMstepIter: number
		mstepTolerance: number
		etaClamp: number
	}
	thresholds: {
		minEventsPerType: number
		minTargetEventsForEdges: number
	}
}

export function fitSwitchingModel (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	config: SwitchingModelConfig,
	runtime?: ModelRuntime,
	onProgress?: ProgressCallback
): FitResult {
	const { T, numTypes, eventCountsByType } = binnedData
	const { P } = baseline
	const { B, basis } = history
	const { M } = motifSet
	const { R, stickyPrior, penalties, em, thresholds } = config

	const J = basis.J
	const D = runtime?.nonlinearSpec?.D ?? 0
	const L = runtime?.nonlinearSpec?.L ?? 0
	const G = D > 0 && L >= 0 ? 2 * D * (L + 1) : 0
	const F = runtime?.projIndex?.F ?? 0

	const eligibleTypes: number[] = []
	for (let k = 0; k < numTypes; k++) {
		if (eventCountsByType[k] >= thresholds.minEventsPerType) {
			eligibleTypes.push(k)
		}
	}

	if (eligibleTypes.length === 0) {
		onProgress?.('No eligible types', 100, 'Insufficient data')
		return createEmptyResult(T, R, P, numTypes, B, J, M, G, F)
	}

	onProgress?.('Initializing model', 5, `${eligibleTypes.length} types, ${R} regimes`)

	let hmm = initializeHMMParams(R, 0.9)
	const coefficients = initializeCoefficients(P, numTypes, J, M, G, F, R)

	let gamma = new Float32Array(T * R)
	for (let t = 0; t < T; t++) {
		for (let r = 0; r < R; r++) {
			gamma[t * R + r] = 1.0 / R
		}
	}

	const trainLogLik: number[] = []
	let prevLL = -Infinity
	let converged = false

	const basePoissonConfig: PoissonFitConfig = {
		lambdaGroup: penalties.lambdaGroup,
		lambda1: penalties.lambda1,
		lambda2: penalties.lambda2,
		lambdaMotif: penalties.lambdaMotif,
		lambdaNonlinear: penalties.lambdaNonlinear,
		lambdaInteract: penalties.lambdaInteract,
		reweightL1: penalties.reweightL1,
		maxIter: em.maxMstepIter,
		tolerance: em.mstepTolerance,
		etaClamp: em.etaClamp
	}

	const occupancy = new Float32Array(R)

	for (let iter = 0; iter < em.maxIter; iter++) {
		const progress = 5 + Math.round((iter / em.maxIter) * 85)
		onProgress?.('EM iteration', progress, `Iteration ${iter + 1}/${em.maxIter}`)

		let mstepMaxIter: number
		let mstepTolerance: number
		if (iter < 5) {
			mstepMaxIter = Math.min(25, basePoissonConfig.maxIter)
			mstepTolerance = 1e-4
		} else if (iter < 15) {
			mstepMaxIter = Math.min(50, basePoissonConfig.maxIter)
			mstepTolerance = 5e-5
		} else {
			mstepMaxIter = basePoissonConfig.maxIter
			mstepTolerance = basePoissonConfig.tolerance
		}

		occupancy.fill(0)
		for (let t = 0; t < T; t++) {
			for (let r = 0; r < R; r++) {
				occupancy[r] += gamma[t * R + r]
			}
		}
		for (let r = 0; r < R; r++) occupancy[r] /= T

		for (const k of eligibleTypes) {
			const regimeCoeffs = coefficients.get(k)!

			for (let r = 0; r < R; r++) {
				const occ = occupancy[r]
				let thisMaxIter = mstepMaxIter
				if (occ < 0.02) {
					thisMaxIter = Math.min(10, thisMaxIter)
				} else if (occ < 0.05) {
					thisMaxIter = Math.min(25, thisMaxIter)
				}

				const poissonConfig: PoissonFitConfig = {
					...basePoissonConfig,
					maxIter: thisMaxIter,
					tolerance: mstepTolerance
				}

				const result = fitPoissonRegimeType(
					binnedData,
					baseline,
					history,
					motifSet,
					k,
					gamma,
					r,
					R,
					poissonConfig,
					runtime,
					regimeCoeffs[r]
				)
				regimeCoeffs[r] = result.coefficients
			}
		}

		const eligibleCoeffs = new Map<number, RegimeCoefficients[]>()
		for (const k of eligibleTypes) {
			eligibleCoeffs.set(k, coefficients.get(k)!)
		}

		const logEmission = computeTotalLogEmission(
			binnedData,
			baseline,
			history,
			motifSet,
			eligibleCoeffs,
			em.etaClamp,
			runtime
		)

		const fbResult = forwardBackward(logEmission, hmm)
		gamma = fbResult.gamma
		trainLogLik.push(fbResult.logLik)

		hmm = updateHMMParams(gamma, fbResult.xiSum, R, T, stickyPrior)

		const llChange = Math.abs(fbResult.logLik - prevLL) / (Math.abs(prevLL) + 1e-8)
		if (iter > 2 && llChange < em.tolerance) {
			converged = true
			onProgress?.('EM converged', 90, `Converged at iteration ${iter + 1}`)
			break
		}

		prevLL = fbResult.logLik
	}

	onProgress?.('Finalizing model', 95, 'Building output')

	const flatCoefficients: RegimeCoefficients[] = []
	for (let r = 0; r < R; r++) {
		const merged: RegimeCoefficients = {
			beta: new Float32Array(P * numTypes),
			edgeWeights: new Float32Array(numTypes * numTypes * J),
			motifWeights: new Float32Array(M * numTypes),
			nonlinearWeights: new Float32Array(G * numTypes),
			interactWeights: new Float32Array(F * numTypes)
		}

		for (let k = 0; k < numTypes; k++) {
			const regimeCoeffs = coefficients.get(k)
			if (regimeCoeffs) {
				const src = regimeCoeffs[r]
				for (let p = 0; p < P; p++) {
					merged.beta[k * P + p] = src.beta[p]
				}
				for (let i = 0; i < numTypes * J; i++) {
					merged.edgeWeights[k * numTypes * J + i] = src.edgeWeights[i]
				}
				for (let m = 0; m < M; m++) {
					merged.motifWeights[k * M + m] = src.motifWeights[m]
				}
				for (let g = 0; g < G; g++) {
					merged.nonlinearWeights[k * G + g] = src.nonlinearWeights[g]
				}
				for (let f = 0; f < F; f++) {
					merged.interactWeights[k * F + f] = src.interactWeights[f]
				}
			}
		}

		flatCoefficients.push(merged)
	}

	const params: ModelParams = {
		hmm,
		coefficients: flatCoefficients,
		numTypes,
		P,
		B,
		J,
		M,
		G,
		F
	}

	return {
		params,
		gamma,
		trainLogLik,
		converged
	}
}

function createEmptyResult (
	T: number,
	R: number,
	P: number,
	numTypes: number,
	B: number,
	J: number,
	M: number,
	G: number,
	F: number
): FitResult {
	const hmm = initializeHMMParams(R)

	const flatCoefficients: RegimeCoefficients[] = []
	for (let r = 0; r < R; r++) {
		flatCoefficients.push({
			beta: new Float32Array(P * numTypes),
			edgeWeights: new Float32Array(numTypes * numTypes * J),
			motifWeights: new Float32Array(M * numTypes),
			nonlinearWeights: new Float32Array(G * numTypes),
			interactWeights: new Float32Array(F * numTypes)
		})
	}

	const gamma = new Float32Array(T * R)
	for (let t = 0; t < T; t++) {
		for (let r = 0; r < R; r++) {
			gamma[t * R + r] = 1.0 / R
		}
	}

	return {
		params: {
			hmm,
			coefficients: flatCoefficients,
			numTypes,
			P,
			B,
			J,
			M,
			G,
			F
		},
		gamma,
		trainLogLik: [],
		converged: false
	}
}

export function getEdgeBasisCoeffs (
	params: ModelParams,
	targetType: number,
	sourceType: number,
	regime: number
): Float32Array {
	const { J, numTypes, coefficients } = params
	const regimeCoeffs = coefficients[regime]

	const coeffs = new Float32Array(J)
	const offset = targetType * numTypes * J + sourceType * J

	for (let j = 0; j < J; j++) {
		coeffs[j] = regimeCoeffs.edgeWeights[offset + j]
	}

	return coeffs
}

export function getEdgeKernelByBin (
	params: ModelParams,
	targetType: number,
	sourceType: number,
	regime: number,
	basis: LagBasis
): Float32Array {
	const coeffs = getEdgeBasisCoeffs(params, targetType, sourceType, regime)
	return computeKernelByBin(basis, coeffs)
}

export function getEdgeWeights (
	params: ModelParams,
	targetType: number,
	sourceType: number,
	regime: number
): Float32Array {
	const { J, numTypes, coefficients } = params
	const regimeCoeffs = coefficients[regime]

	const weights = new Float32Array(J)
	const offset = targetType * numTypes * J + sourceType * J

	for (let j = 0; j < J; j++) {
		weights[j] = regimeCoeffs.edgeWeights[offset + j]
	}

	return weights
}

export function getBaselineCoeffs (
	params: ModelParams,
	targetType: number,
	regime: number
): Float32Array {
	const { P, coefficients } = params
	const regimeCoeffs = coefficients[regime]

	const beta = new Float32Array(P)
	const offset = targetType * P

	for (let p = 0; p < P; p++) {
		beta[p] = regimeCoeffs.beta[offset + p]
	}

	return beta
}

export function getMotifWeight (
	params: ModelParams,
	targetType: number,
	motifIdx: number,
	regime: number
): number {
	const { M, coefficients } = params
	const regimeCoeffs = coefficients[regime]

	return regimeCoeffs.motifWeights[targetType * M + motifIdx]
}

export function aggregateAcrossRegimes (
	params: ModelParams,
	gamma: Float32Array,
	T: number,
	extractor: (regime: number) => Float32Array
): Float32Array {
	const { hmm: { R } } = params

	const occupancy = new Float32Array(R)
	for (let t = 0; t < T; t++) {
		for (let r = 0; r < R; r++) {
			occupancy[r] += gamma[t * R + r]
		}
	}
	for (let r = 0; r < R; r++) {
		occupancy[r] /= T
	}

	const sample = extractor(0)
	const result = new Float32Array(sample.length)

	for (let r = 0; r < R; r++) {
		const weights = extractor(r)
		for (let i = 0; i < result.length; i++) {
			result[i] += occupancy[r] * weights[i]
		}
	}

	return result
}
