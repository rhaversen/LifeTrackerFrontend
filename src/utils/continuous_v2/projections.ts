import type { HistoryDesign, ProjIndex } from './types'

export function lcg (seed: number): () => number {
	let s = seed >>> 0
	return (): number => {
		s = (1664525 * s + 1013904223) >>> 0
		return s / 0x100000000
	}
}

export interface Projections {
	F: number
	K: number
	proj: Int8Array
	norm: Float32Array
}

export function buildAchlioptasProjections (F: number, K: number, seed: number): Projections {
	const rand = lcg(seed)
	const proj = new Int8Array(F * K)
	const norm = new Float32Array(F)

	for (let f = 0; f < F; f++) {
		let nnz = 0
		for (let i = 0; i < K; i++) {
			const u = rand()
			let v = 0
			if (u < 1 / 6) {
				v = 1
			} else if (u >= 5 / 6) {
				v = -1
			}
			proj[f * K + i] = v
			if (v !== 0) {
				nnz++
			}
		}
		norm[f] = nnz > 0 ? 1 / Math.sqrt(nnz) : 1
	}

	return { F, K, proj, norm }
}

export function buildProjIndex (p: Projections): ProjIndex {
	const { F, K, proj, norm } = p

	let nnz = 0
	for (let f = 0; f < F; f++) {
		for (let i = 0; i < K; i++) {
			if (proj[f * K + i] !== 0) {
				nnz++
			}
		}
	}

	const rowCounts = new Int32Array(K)
	for (let f = 0; f < F; f++) {
		for (let i = 0; i < K; i++) {
			if (proj[f * K + i] !== 0) {
				rowCounts[i]++
			}
		}
	}

	const rowPtr = new Int32Array(K + 1)
	for (let i = 0; i < K; i++) {
		rowPtr[i + 1] = rowPtr[i] + rowCounts[i]
	}

	const fIdx = new Int16Array(nnz)
	const sgn = new Int8Array(nnz)
	const cursor = new Int32Array(K)

	for (let f = 0; f < F; f++) {
		for (let i = 0; i < K; i++) {
			const v = proj[f * K + i]
			if (v === 0) { continue }
			const pos = rowPtr[i] + cursor[i]++
			fIdx[pos] = f
			sgn[pos] = v
		}
	}

	return { F, K, rowPtr, fIdx, sgn, norm }
}

export function computeInteractionFeatures (
	history: HistoryDesign,
	t: number,
	projIndex: ProjIndex,
	interactDecayByBin: Float32Array
): Float32Array {
	const { F, rowPtr, fIdx, sgn, norm } = projIndex
	const { B } = history
	const v = new Float32Array(F)

	if (history.type === 'dense') {
		const { numTypes, H } = history
		for (let i = 0; i < numTypes; i++) {
			let decayedSum = 0
			for (let b = 0; b < B; b++) {
				decayedSum += H[(t * numTypes + i) * B + b] * interactDecayByBin[b]
			}
			if (decayedSum === 0) { continue }

			const start = rowPtr[i]
			const end = rowPtr[i + 1]
			for (let idx = start; idx < end; idx++) {
				v[fIdx[idx]] += decayedSum * sgn[idx]
			}
		}
	} else {
		const decayedByType = new Float32Array(history.numTypes)
		const start = history.rowPtr[t]
		const end = history.rowPtr[t + 1]
		for (let idx = start; idx < end; idx++) {
			const col = history.colIdx[idx]
			const i = (col / B) | 0
			const b = col - i * B
			decayedByType[i] += history.val[idx] * interactDecayByBin[b]
		}

		for (let i = 0; i < history.numTypes; i++) {
			const s = decayedByType[i]
			if (s === 0) { continue }

			const pStart = rowPtr[i]
			const pEnd = rowPtr[i + 1]
			for (let idx = pStart; idx < pEnd; idx++) {
				v[fIdx[idx]] += s * sgn[idx]
			}
		}
	}

	for (let f = 0; f < F; f++) {
		v[f] *= norm[f]
	}

	const q = new Float32Array(F)
	for (let f = 0; f < F; f++) {
		q[f] = v[f] * v[f]
	}

	return q
}

export function computeInteractionFeaturesInto (
	history: HistoryDesign,
	t: number,
	projIndex: ProjIndex,
	interactDecayByBin: Float32Array,
	qOut: Float32Array,
	tmpV: Float32Array,
	tmpDecayedByType?: Float32Array
): void {
	const { F, rowPtr, fIdx, sgn, norm } = projIndex
	const { B } = history

	tmpV.fill(0)

	if (history.type === 'dense') {
		const { numTypes, H } = history
		for (let i = 0; i < numTypes; i++) {
			let decayedSum = 0
			const base = (t * numTypes + i) * B
			for (let b = 0; b < B; b++) decayedSum += H[base + b] * interactDecayByBin[b]
			if (decayedSum === 0) continue

			const start = rowPtr[i]
			const end = rowPtr[i + 1]
			for (let idx = start; idx < end; idx++) tmpV[fIdx[idx]] += decayedSum * sgn[idx]
		}
	} else {
		const decayedByType = tmpDecayedByType!
		decayedByType.fill(0)

		const start = history.rowPtr[t]
		const end = history.rowPtr[t + 1]
		for (let idx = start; idx < end; idx++) {
			const col = history.colIdx[idx]
			const i = (col / B) | 0
			const b = col - i * B
			decayedByType[i] += history.val[idx] * interactDecayByBin[b]
		}

		for (let i = 0; i < history.numTypes; i++) {
			const s = decayedByType[i]
			if (s === 0) continue
			const pStart = rowPtr[i]
			const pEnd = rowPtr[i + 1]
			for (let idx = pStart; idx < pEnd; idx++) tmpV[fIdx[idx]] += s * sgn[idx]
		}
	}

	for (let f = 0; f < F; f++) {
		const v = tmpV[f] * norm[f]
		qOut[f] = v * v
	}
}

export function computeInteractionContribution (q: Float32Array, weights: Float32Array): number {
	let sum = 0
	const F = q.length
	for (let f = 0; f < F; f++) {
		sum += q[f] * weights[f]
	}
	return sum
}

export function computeInteractionGradients (q: Float32Array, resid: number): Float32Array {
	const F = q.length
	const grad = new Float32Array(F)
	for (let f = 0; f < F; f++) {
		grad[f] = -q[f] * resid
	}
	return grad
}

export function computeInteractionGradientsInto (
	q: Float32Array,
	resid: number,
	gradOut: Float32Array
): void {
	const F = q.length
	for (let f = 0; f < F; f++) gradOut[f] = -q[f] * resid
}
