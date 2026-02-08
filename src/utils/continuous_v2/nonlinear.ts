import type { HistoryDesign, NonlinearSpec } from './types'

export function buildNonlinearSpec (scalesHours: number[], knots: number[]): NonlinearSpec {
	const D = scalesHours.length
	const L = knots.length
	return {
		D,
		L,
		knots: new Float32Array(knots),
		scalesHours: new Float32Array(scalesHours)
	}
}

export function hingeBasisDot (coeffs: Float32Array, offset: number, knots: Float32Array, z: number): number {
	let out = coeffs[offset] * z
	const L = knots.length
	for (let l = 0; l < L; l++) {
		const h = z - knots[l]
		if (h > 0) {
			out += coeffs[offset + 1 + l] * h
		}
	}
	return out
}

export function computeDecayedSumsFromRow (
	history: HistoryDesign,
	t: number,
	targetType: number,
	decayByScaleBin: Float32Array,
	D: number
): { selfSums: Float32Array; globalSums: Float32Array } {
	const { B } = history
	const selfSums = new Float32Array(D)
	const globalSums = new Float32Array(D)

	if (history.type === 'dense') {
		const { numTypes, H } = history
		for (let i = 0; i < numTypes; i++) {
			for (let b = 0; b < B; b++) {
				const c = H[(t * numTypes + i) * B + b]
				if (c === 0) { continue }
				for (let d = 0; d < D; d++) {
					const decay = decayByScaleBin[d * B + b]
					const contrib = c * decay
					globalSums[d] += contrib
					if (i === targetType) {
						selfSums[d] += contrib
					}
				}
			}
		}
	} else {
		const start = history.rowPtr[t]
		const end = history.rowPtr[t + 1]
		for (let idx = start; idx < end; idx++) {
			const col = history.colIdx[idx]
			const i = (col / B) | 0
			const b = col - i * B
			const c = history.val[idx]
			for (let d = 0; d < D; d++) {
				const decay = decayByScaleBin[d * B + b]
				const contrib = c * decay
				globalSums[d] += contrib
				if (i === targetType) {
					selfSums[d] += contrib
				}
			}
		}
	}

	return { selfSums, globalSums }
}

export function computeNonlinearContribution (
	selfSums: Float32Array,
	globalSums: Float32Array,
	weights: Float32Array,
	spec: NonlinearSpec
): number {
	const { D, L, knots } = spec
	const blocksPerD = L + 1

	let sum = 0

	for (let d = 0; d < D; d++) {
		const zSelf = Math.log1p(selfSums[d])
		const zGlobal = Math.log1p(globalSums[d])

		const selfOffset = d * blocksPerD
		const globalOffset = D * blocksPerD + d * blocksPerD

		sum += hingeBasisDot(weights, selfOffset, knots, zSelf)
		sum += hingeBasisDot(weights, globalOffset, knots, zGlobal)
	}

	return sum
}

export function computeNonlinearGradients (
	selfSums: Float32Array,
	globalSums: Float32Array,
	resid: number,
	spec: NonlinearSpec
): Float32Array {
	const { D, L, knots } = spec
	const blocksPerD = L + 1
	const G = 2 * D * blocksPerD
	const grad = new Float32Array(G)

	for (let d = 0; d < D; d++) {
		const zSelf = Math.log1p(selfSums[d])
		const zGlobal = Math.log1p(globalSums[d])

		const selfOffset = d * blocksPerD
		const globalOffset = D * blocksPerD + d * blocksPerD

		grad[selfOffset] = -zSelf * resid
		for (let l = 0; l < L; l++) {
			const h = zSelf - knots[l]
			grad[selfOffset + 1 + l] = h > 0 ? -h * resid : 0
		}

		grad[globalOffset] = -zGlobal * resid
		for (let l = 0; l < L; l++) {
			const h = zGlobal - knots[l]
			grad[globalOffset + 1 + l] = h > 0 ? -h * resid : 0
		}
	}

	return grad
}

export function computeG (D: number, L: number): number {
	return 2 * D * (L + 1)
}

export function applyNonlinearGroupLasso (
	weights: Float32Array,
	lambda: number,
	stepSize: number,
	D: number,
	L: number
): void {
	const blocksPerD = L + 1

	for (let d = 0; d < D; d++) {
		const selfOffset = d * blocksPerD
		let selfNorm = 0
		for (let j = 0; j < blocksPerD; j++) {
			selfNorm += weights[selfOffset + j] ** 2
		}
		selfNorm = Math.sqrt(selfNorm)
		const selfThreshold = stepSize * lambda
		if (selfNorm > selfThreshold) {
			const scale = (selfNorm - selfThreshold) / selfNorm
			for (let j = 0; j < blocksPerD; j++) {
				weights[selfOffset + j] *= scale
			}
		} else {
			for (let j = 0; j < blocksPerD; j++) {
				weights[selfOffset + j] = 0
			}
		}

		const globalOffset = D * blocksPerD + d * blocksPerD
		let globalNorm = 0
		for (let j = 0; j < blocksPerD; j++) {
			globalNorm += weights[globalOffset + j] ** 2
		}
		globalNorm = Math.sqrt(globalNorm)
		const globalThreshold = stepSize * lambda
		if (globalNorm > globalThreshold) {
			const scale = (globalNorm - globalThreshold) / globalNorm
			for (let j = 0; j < blocksPerD; j++) {
				weights[globalOffset + j] *= scale
			}
		} else {
			for (let j = 0; j < blocksPerD; j++) {
				weights[globalOffset + j] = 0
			}
		}
	}
}

export function computeDecayedSumsFromRowInto (
	history: HistoryDesign,
	t: number,
	targetType: number,
	decayByScaleBin: Float32Array,
	D: number,
	selfSums: Float32Array,
	globalSums: Float32Array
): void {
	selfSums.fill(0)
	globalSums.fill(0)
	const { B } = history

	if (history.type === 'dense') {
		const { numTypes, H } = history
		for (let i = 0; i < numTypes; i++) {
			for (let b = 0; b < B; b++) {
				const c = H[(t * numTypes + i) * B + b]
				if (c === 0) continue
				for (let d = 0; d < D; d++) {
					const contrib = c * decayByScaleBin[d * B + b]
					globalSums[d] += contrib
					if (i === targetType) selfSums[d] += contrib
				}
			}
		}
	} else {
		const start = history.rowPtr[t]
		const end = history.rowPtr[t + 1]
		for (let idx = start; idx < end; idx++) {
			const col = history.colIdx[idx]
			const i = (col / B) | 0
			const b = col - i * B
			const c = history.val[idx]
			for (let d = 0; d < D; d++) {
				const contrib = c * decayByScaleBin[d * B + b]
				globalSums[d] += contrib
				if (i === targetType) selfSums[d] += contrib
			}
		}
	}
}

export function computeNonlinearGradientsInto (
	selfSums: Float32Array,
	globalSums: Float32Array,
	resid: number,
	spec: NonlinearSpec,
	gradOut: Float32Array
): void {
	gradOut.fill(0)
	const { D, L, knots } = spec
	const blocksPerD = L + 1

	for (let d = 0; d < D; d++) {
		const zSelf = Math.log1p(selfSums[d])
		const zGlobal = Math.log1p(globalSums[d])

		const selfOffset = d * blocksPerD
		const globalOffset = D * blocksPerD + d * blocksPerD

		gradOut[selfOffset] = -zSelf * resid
		for (let l = 0; l < L; l++) {
			const h = zSelf - knots[l]
			gradOut[selfOffset + 1 + l] = h > 0 ? -h * resid : 0
		}

		gradOut[globalOffset] = -zGlobal * resid
		for (let l = 0; l < L; l++) {
			const h = zGlobal - knots[l]
			gradOut[globalOffset + 1 + l] = h > 0 ? -h * resid : 0
		}
	}
}
