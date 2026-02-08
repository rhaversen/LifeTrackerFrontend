import { computeHistoryDotProduct, computeEdgeGradientsFromRow, traverseHistoryRowUnified } from './history'
import { computeMotifDotProduct, computeMotifGradientsSparse } from './motifs'
import {
	computeNonlinearContribution,
	applyNonlinearGroupLasso,
	computeNonlinearGradientsInto
} from './nonlinear'
import type {
	BinnedData,
	BaselineDesign,
	HistoryDesign,
	MotifSet,
	RegimeCoefficients,
	ModelRuntime,
	PipelineConfig
} from './types'

export interface PoissonFitConfig {
	lambdaGroup: number
	lambda1: number
	lambda2: number
	lambdaMotif: number
	lambdaNonlinear: number
	lambdaInteract: number
	reweightL1: {
		enabled: boolean
		eps: number
		every: number
	}
	maxIter: number
	tolerance: number
	etaClamp: number
}

export interface PoissonFitResult {
	coefficients: RegimeCoefficients
	finalLoss: number
	iterations: number
	converged: boolean
}

function softThreshold (v: number, tau: number): number {
	if (v > tau) { return v - tau }
	if (v < -tau) { return v + tau }
	return 0
}

function groupShrink (v: Float32Array, start: number, len: number, tau: number): void {
	let norm = 0
	for (let i = 0; i < len; i++) {
		norm += v[start + i] * v[start + i]
	}
	norm = Math.sqrt(norm)

	if (norm <= tau) {
		for (let i = 0; i < len; i++) {
			v[start + i] = 0
		}
	} else {
		const scale = 1 - tau / norm
		for (let i = 0; i < len; i++) {
			v[start + i] *= scale
		}
	}
}

function clampEta (eta: number, clamp: number): number {
	return Math.max(-clamp, Math.min(clamp, eta))
}

export function fitPoissonRegimeType (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	targetType: number,
	gamma: Float32Array,
	regimeIdx: number,
	R: number,
	config: PoissonFitConfig,
	runtime?: ModelRuntime,
	initialCoeffs?: RegimeCoefficients
): PoissonFitResult {
	const { T, numTypes, y, dtHours } = binnedData
	const { P } = baseline
	const { B, basis } = history
	const { M } = motifSet

	const J = basis.J
	const numEdgeParams = numTypes * J
	const numMotifParams = M

	const D = runtime?.nonlinearSpec?.D ?? 0
	const L = runtime?.nonlinearSpec?.L ?? 0
	const G = D > 0 && L >= 0 ? 2 * D * (L + 1) : 0
	const F = runtime?.projIndex?.F ?? 0

	let coeffs: RegimeCoefficients
	if (initialCoeffs) {
		coeffs = {
			beta: new Float32Array(initialCoeffs.beta),
			edgeWeights: new Float32Array(initialCoeffs.edgeWeights),
			motifWeights: new Float32Array(initialCoeffs.motifWeights),
			nonlinearWeights: new Float32Array(initialCoeffs.nonlinearWeights),
			interactWeights: new Float32Array(initialCoeffs.interactWeights)
		}
	} else {
		coeffs = {
			beta: new Float32Array(P),
			edgeWeights: new Float32Array(numEdgeParams),
			motifWeights: new Float32Array(numMotifParams),
			nonlinearWeights: new Float32Array(G),
			interactWeights: new Float32Array(F)
		}

		let sumY = 0
		let sumDt = 0
		for (let t = 0; t < T; t++) {
			const w = gamma[t * R + regimeIdx]
			sumY += w * y[t * numTypes + targetType]
			sumDt += w * dtHours[t]
		}

		if (sumDt > 0 && sumY > 0) {
			coeffs.beta[0] = Math.log(sumY / sumDt)
		}
	}

	const significantBins: number[] = []
	const significantWeights: number[] = []
	const WEIGHT_THRESHOLD = 1e-6
	for (let t = 0; t < T; t++) {
		const w = gamma[t * R + regimeIdx]
		if (w > WEIGHT_THRESHOLD) {
			significantBins.push(t)
			significantWeights.push(w)
		}
	}
	const numSig = significantBins.length

	const cachedSelfSums = D > 0 ? new Float32Array(numSig * D) : new Float32Array(0)
	const cachedGlobalSums = D > 0 ? new Float32Array(numSig * D) : new Float32Array(0)
	const cachedQ = F > 0 ? new Float32Array(numSig * F) : new Float32Array(0)

	const phi = basis.phiByBin
	const tmpSelf = D > 0 ? new Float32Array(D) : new Float32Array(0)
	const tmpGlobal = D > 0 ? new Float32Array(D) : new Float32Array(0)
	const tmpDecayedByType = new Float32Array(numTypes)
	const tmpV = F > 0 ? new Float32Array(F) : new Float32Array(0)
	const tmpQ = F > 0 ? new Float32Array(F) : new Float32Array(0)

	for (let s = 0; s < numSig; s++) {
		const t = significantBins[s]

		traverseHistoryRowUnified(
			history, t, targetType,
			coeffs.edgeWeights, J, phi,
			D > 0 ? history.decayByScaleBin : undefined, D,
			F > 0 ? history.interactDecayByBin : undefined,
			tmpSelf, tmpGlobal, tmpDecayedByType
		)

		if (D > 0) {
			for (let d = 0; d < D; d++) {
				cachedSelfSums[s * D + d] = tmpSelf[d]
				cachedGlobalSums[s * D + d] = tmpGlobal[d]
			}
		}

		if (F > 0 && runtime?.projIndex) {
			const { rowPtr, fIdx, sgn, norm } = runtime.projIndex
			tmpV.fill(0)
			for (let i = 0; i < numTypes; i++) {
				const decayed = tmpDecayedByType[i]
				if (decayed === 0) continue
				const pStart = rowPtr[i]
				const pEnd = rowPtr[i + 1]
				for (let idx = pStart; idx < pEnd; idx++) {
					tmpV[fIdx[idx]] += decayed * sgn[idx]
				}
			}
			for (let f = 0; f < F; f++) {
				const v = tmpV[f] * norm[f]
				cachedQ[s * F + f] = v * v
			}
		}
	}

	const gradBeta = new Float32Array(P)
	const gradEdge = new Float32Array(numEdgeParams)
	const gradMotif = new Float32Array(numMotifParams)
	const gradNonlinear = new Float32Array(G)
	const gradInteract = new Float32Array(F)

	const nlGradTmp = G > 0 ? new Float32Array(G) : new Float32Array(0)

	let stepSize = 0.1
	let prevLoss = Infinity
	let converged = false
	let iter = 0

	for (iter = 0; iter < config.maxIter; iter++) {
		gradBeta.fill(0)
		gradEdge.fill(0)
		gradMotif.fill(0)
		gradNonlinear.fill(0)
		gradInteract.fill(0)

		let loss = 0

		for (let s = 0; s < numSig; s++) {
			const t = significantBins[s]
			const w = significantWeights[s]

			let eta = 0

			const baseOff = t * P
			for (let p = 0; p < P; p++) {
				eta += baseline.X[baseOff + p] * coeffs.beta[p]
			}

			eta += computeHistoryDotProduct(history, t, coeffs.edgeWeights, targetType)

			if (M > 0) {
				eta += computeMotifDotProduct(motifSet, t, coeffs.motifWeights)
			}

			if (G > 0 && runtime?.nonlinearSpec) {
				for (let d = 0; d < D; d++) {
					tmpSelf[d] = cachedSelfSums[s * D + d]
					tmpGlobal[d] = cachedGlobalSums[s * D + d]
				}
				eta += computeNonlinearContribution(tmpSelf, tmpGlobal, coeffs.nonlinearWeights, runtime.nonlinearSpec)
			}

			if (F > 0) {
				for (let f = 0; f < F; f++) {
					eta += cachedQ[s * F + f] * coeffs.interactWeights[f]
				}
			}

			const et = clampEta(eta, config.etaClamp)
			const mut = dtHours[t] * Math.exp(et)
			const yVal = y[t * numTypes + targetType]

			loss -= w * (yVal * et - mut)

			const residual = w * (yVal - mut)

			for (let p = 0; p < P; p++) {
				gradBeta[p] -= baseline.X[baseOff + p] * residual
			}

			computeEdgeGradientsFromRow(history, t, targetType, residual, J, phi, gradEdge)

			computeMotifGradientsSparse(motifSet, t, residual, gradMotif)

			if (G > 0 && runtime?.nonlinearSpec) {
				computeNonlinearGradientsInto(tmpSelf, tmpGlobal, residual, runtime.nonlinearSpec, nlGradTmp)
				for (let g = 0; g < G; g++) {
					gradNonlinear[g] += nlGradTmp[g]
				}
			}

			if (F > 0) {
				for (let f = 0; f < F; f++) {
					gradInteract[f] -= cachedQ[s * F + f] * residual
				}
			}
		}

		for (let p = 0; p < P; p++) {
			loss += config.lambda2 * coeffs.beta[p] * coeffs.beta[p]
		}

		for (let i = 0; i < numEdgeParams; i++) {
			loss += config.lambda1 * Math.abs(coeffs.edgeWeights[i])
			loss += config.lambda2 * coeffs.edgeWeights[i] * coeffs.edgeWeights[i]
		}

		for (let i = 0; i < numTypes; i++) {
			if (i === targetType) continue
			let groupNorm = 0
			for (let j = 0; j < J; j++) {
				const idx = i * J + j
				groupNorm += coeffs.edgeWeights[idx] * coeffs.edgeWeights[idx]
			}
			loss += config.lambdaGroup * Math.sqrt(groupNorm)
		}

		for (let m = 0; m < numMotifParams; m++) {
			loss += config.lambdaMotif * Math.abs(coeffs.motifWeights[m])
		}

		if (G > 0) {
			for (let i = 0; i < G; i++) {
				loss += config.lambda2 * coeffs.nonlinearWeights[i] * coeffs.nonlinearWeights[i]
			}
		}

		if (F > 0) {
			for (let f = 0; f < F; f++) {
				loss += config.lambdaInteract * Math.abs(coeffs.interactWeights[f])
			}
		}

		if (Math.abs(prevLoss - loss) / (Math.abs(prevLoss) + 1e-8) < config.tolerance) {
			converged = true
			break
		}

		if (loss > prevLoss) {
			stepSize *= 0.5
		} else {
			stepSize = Math.min(stepSize * 1.1, 0.5)
		}
		prevLoss = loss

		for (let p = 0; p < P; p++) {
			gradBeta[p] += 2 * config.lambda2 * coeffs.beta[p]
		}

		for (let i = 0; i < numEdgeParams; i++) {
			gradEdge[i] += 2 * config.lambda2 * coeffs.edgeWeights[i]
		}

		for (let g = 0; g < G; g++) {
			gradNonlinear[g] += 2 * config.lambda2 * coeffs.nonlinearWeights[g]
		}

		for (let p = 0; p < P; p++) {
			coeffs.beta[p] -= stepSize * gradBeta[p]
		}

		for (let i = 0; i < numEdgeParams; i++) {
			coeffs.edgeWeights[i] -= stepSize * gradEdge[i]
		}

		for (let m = 0; m < numMotifParams; m++) {
			coeffs.motifWeights[m] -= stepSize * gradMotif[m]
		}

		for (let g = 0; g < G; g++) {
			coeffs.nonlinearWeights[g] -= stepSize * gradNonlinear[g]
		}

		for (let f = 0; f < F; f++) {
			coeffs.interactWeights[f] -= stepSize * gradInteract[f]
		}

		const useReweight = config.reweightL1.enabled && iter > 0 && iter % config.reweightL1.every === 0
		const eps = config.reweightL1.eps

		for (let i = 0; i < numEdgeParams; i++) {
			const tau = useReweight
				? stepSize * config.lambda1 / (Math.abs(coeffs.edgeWeights[i]) + eps)
				: stepSize * config.lambda1
			coeffs.edgeWeights[i] = softThreshold(coeffs.edgeWeights[i], tau)
		}

		for (let i = 0; i < numTypes; i++) {
			if (i === targetType) { continue }
			groupShrink(coeffs.edgeWeights, i * J, J, stepSize * config.lambdaGroup)
		}

		for (let m = 0; m < numMotifParams; m++) {
			const tau = useReweight
				? stepSize * config.lambdaMotif / (Math.abs(coeffs.motifWeights[m]) + eps)
				: stepSize * config.lambdaMotif
			coeffs.motifWeights[m] = softThreshold(coeffs.motifWeights[m], tau)
		}

		if (G > 0 && runtime?.nonlinearSpec) {
			applyNonlinearGroupLasso(
				coeffs.nonlinearWeights,
				config.lambdaNonlinear,
				stepSize,
				runtime.nonlinearSpec.D,
				runtime.nonlinearSpec.L
			)
		}

		for (let f = 0; f < F; f++) {
			const tau = useReweight
				? stepSize * config.lambdaInteract / (Math.abs(coeffs.interactWeights[f]) + eps)
				: stepSize * config.lambdaInteract
			coeffs.interactWeights[f] = softThreshold(coeffs.interactWeights[f], tau)
		}
	}

	return {
		coefficients: coeffs,
		finalLoss: prevLoss,
		iterations: iter,
		converged
	}
}

export function computeLogEmissionForType (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	targetType: number,
	allRegimeCoeffs: RegimeCoefficients[],
	etaClamp: number,
	runtime?: ModelRuntime
): Float32Array {
	const { T, numTypes, y, dtHours } = binnedData
	const { P } = baseline
	const { B, basis } = history
	const { M } = motifSet
	const R = allRegimeCoeffs.length

	const D = runtime?.nonlinearSpec?.D ?? 0
	const L = runtime?.nonlinearSpec?.L ?? 0
	const G = D > 0 && L >= 0 ? 2 * D * (L + 1) : 0
	const F = runtime?.projIndex?.F ?? 0

	const J = basis.J
	const phi = basis.phiByBin

	const logEmission = new Float32Array(T * R)

	const tmpSelf = D > 0 ? new Float32Array(D) : new Float32Array(0)
	const tmpGlobal = D > 0 ? new Float32Array(D) : new Float32Array(0)
	const tmpDecayedByType = new Float32Array(numTypes)
	const tmpV = F > 0 ? new Float32Array(F) : new Float32Array(0)
	const tmpQ = F > 0 ? new Float32Array(F) : new Float32Array(0)

	for (let t = 0; t < T; t++) {
		const yVal = y[t * numTypes + targetType]
		const dt = dtHours[t]

		let edgeDot = 0
		tmpSelf.fill(0)
		tmpGlobal.fill(0)
		tmpDecayedByType.fill(0)

		if (history.type === 'sparse') {
			const start = history.rowPtr[t]
			const end = history.rowPtr[t + 1]
			for (let idx = start; idx < end; idx++) {
				const col = history.colIdx[idx]
				const i = (col / B) | 0
				const b = col - i * B
				const c = history.val[idx]

				if (D > 0 && history.decayByScaleBin) {
					for (let d = 0; d < D; d++) {
						const contrib = c * history.decayByScaleBin[d * B + b]
						tmpGlobal[d] += contrib
						if (i === targetType) tmpSelf[d] += contrib
					}
				}

				if (F > 0 && history.interactDecayByBin) {
					tmpDecayedByType[i] += c * history.interactDecayByBin[b]
				}
			}
		} else {
			const { H } = history
			for (let i = 0; i < numTypes; i++) {
				const base = (t * numTypes + i) * B
				for (let b = 0; b < B; b++) {
					const c = H[base + b]
					if (c === 0) continue

					if (D > 0 && history.decayByScaleBin) {
						for (let d = 0; d < D; d++) {
							const contrib = c * history.decayByScaleBin[d * B + b]
							tmpGlobal[d] += contrib
							if (i === targetType) tmpSelf[d] += contrib
						}
					}

					if (F > 0 && history.interactDecayByBin) {
						tmpDecayedByType[i] += c * history.interactDecayByBin[b]
					}
				}
			}
		}

		if (F > 0 && runtime?.projIndex) {
			const { rowPtr, fIdx, sgn, norm } = runtime.projIndex
			tmpV.fill(0)
			for (let i = 0; i < numTypes; i++) {
				const decayed = tmpDecayedByType[i]
				if (decayed === 0) continue
				const pStart = rowPtr[i]
				const pEnd = rowPtr[i + 1]
				for (let idx = pStart; idx < pEnd; idx++) {
					tmpV[fIdx[idx]] += decayed * sgn[idx]
				}
			}
			for (let f = 0; f < F; f++) {
				const v = tmpV[f] * norm[f]
				tmpQ[f] = v * v
			}
		}

		for (let r = 0; r < R; r++) {
			const coeffs = allRegimeCoeffs[r]

			let eta = 0

			const baseOff = t * P
			for (let p = 0; p < P; p++) {
				eta += baseline.X[baseOff + p] * coeffs.beta[p]
			}

			eta += computeHistoryDotProduct(history, t, coeffs.edgeWeights, targetType)

			if (M > 0) {
				eta += computeMotifDotProduct(motifSet, t, coeffs.motifWeights)
			}

			if (G > 0 && runtime?.nonlinearSpec) {
				eta += computeNonlinearContribution(tmpSelf, tmpGlobal, coeffs.nonlinearWeights, runtime.nonlinearSpec)
			}

			if (F > 0) {
				for (let f = 0; f < F; f++) {
					eta += tmpQ[f] * coeffs.interactWeights[f]
				}
			}

			const etaClamped = clampEta(eta, etaClamp)
			const mu = dt * Math.exp(etaClamped)

			logEmission[t * R + r] = yVal * etaClamped - mu
		}
	}

	return logEmission
}

export function computeTotalLogEmission (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	allCoeffs: Map<number, RegimeCoefficients[]>,
	etaClamp: number,
	runtime?: ModelRuntime
): Float32Array {
	const { T, numTypes: _numTypes } = binnedData

	if (allCoeffs.size === 0) {
		throw new Error('No coefficients provided')
	}

	const R = allCoeffs.values().next().value!.length
	const totalLogEmission = new Float32Array(T * R)

	for (const [targetType, regimeCoeffs] of allCoeffs) {
		const typeEmission = computeLogEmissionForType(
			binnedData, baseline, history, motifSet, targetType, regimeCoeffs, etaClamp, runtime
		)

		for (let i = 0; i < T * R; i++) {
			totalLogEmission[i] += typeEmission[i]
		}
	}

	return totalLogEmission
}

export function initializeCoefficients (
	P: number,
	numTypes: number,
	J: number,
	M: number,
	G: number,
	F: number,
	R: number
): Map<number, RegimeCoefficients[]> {
	const coeffs = new Map<number, RegimeCoefficients[]>()

	for (let k = 0; k < numTypes; k++) {
		const regimeCoeffs: RegimeCoefficients[] = []
		for (let r = 0; r < R; r++) {
			regimeCoeffs.push({
				beta: new Float32Array(P),
				edgeWeights: new Float32Array(numTypes * J),
				motifWeights: new Float32Array(M),
				nonlinearWeights: new Float32Array(G),
				interactWeights: new Float32Array(F)
			})
		}
		coeffs.set(k, regimeCoeffs)
	}

	return coeffs
}

export function buildPoissonFitConfigFromPipeline (config: PipelineConfig): PoissonFitConfig {
	return {
		lambdaGroup: config.penalties.lambdaGroup,
		lambda1: config.penalties.lambda1,
		lambda2: config.penalties.lambda2,
		lambdaMotif: config.penalties.lambdaMotif,
		lambdaNonlinear: config.penalties.lambdaNonlinear,
		lambdaInteract: config.penalties.lambdaInteract,
		reweightL1: config.penalties.reweightL1,
		maxIter: config.em.maxMstepIter,
		tolerance: config.em.mstepTolerance,
		etaClamp: config.em.etaClamp
	}
}
