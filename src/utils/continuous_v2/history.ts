import type { BinnedData, LagBins, LagBasis, HistoryDesign, HistoryDesignDense, HistoryDesignSparse, PipelineConfig } from './types'

const MS_PER_HOUR = 60 * 60 * 1000

export function buildLagBins (config: PipelineConfig['lagBins']): LagBins {
	const edgesHours = config.edgesHours
	const B = edgesHours.length - 1

	const edgesMs = new Float64Array(edgesHours.length)
	const midsHours = new Float32Array(B)
	const widthsHours = new Float32Array(B)

	for (let i = 0; i < edgesHours.length; i++) {
		edgesMs[i] = edgesHours[i] * MS_PER_HOUR
	}

	for (let b = 0; b < B; b++) {
		widthsHours[b] = edgesHours[b + 1] - edgesHours[b]
		midsHours[b] = (edgesHours[b] + edgesHours[b + 1]) / 2
	}

	return { B, edgesMs, midsHours, widthsHours }
}

export function buildHistoryDesignDense (
	binnedData: BinnedData,
	eventTimesPerType: Float64Array[],
	lagBins: LagBins,
	basis: LagBasis,
	decayByScaleBin?: Float32Array,
	interactDecayByBin?: Float32Array
): HistoryDesignDense {
	const { T, numTypes, binStartMs } = binnedData
	const { B, edgesMs } = lagBins

	const H = new Uint16Array(T * numTypes * B)

	const ptrLow: number[][] = []
	const ptrHigh: number[][] = []
	for (let i = 0; i < numTypes; i++) {
		ptrLow.push(new Array(B).fill(0))
		ptrHigh.push(new Array(B).fill(0))
	}

	for (let t = 0; t < T; t++) {
		const refTime = binStartMs[t]

		for (let i = 0; i < numTypes; i++) {
			const eventTimes = eventTimesPerType[i]
			const n = eventTimes.length
			if (n === 0) { continue }

			for (let b = 0; b < B; b++) {
				const lagLow = edgesMs[b]
				const lagHigh = edgesMs[b + 1]

				const windowStart = refTime - lagHigh
				const windowEnd = refTime - lagLow

				while (ptrLow[i][b] < n && eventTimes[ptrLow[i][b]] < windowStart) {
					ptrLow[i][b]++
				}
				while (ptrHigh[i][b] < n && eventTimes[ptrHigh[i][b]] < windowEnd) {
					ptrHigh[i][b]++
				}

				const count = ptrHigh[i][b] - ptrLow[i][b]
				const idx = (t * numTypes + i) * B + b
				H[idx] = Math.min(Math.max(0, count), 65535)
			}
		}
	}

	return { type: 'dense', H, T, numTypes, B, basis, decayByScaleBin, interactDecayByBin }
}

export function buildHistoryDesignSparse (
	binnedData: BinnedData,
	eventTimesPerType: Float64Array[],
	lagBins: LagBins,
	basis: LagBasis,
	decayByScaleBin?: Float32Array,
	interactDecayByBin?: Float32Array
): HistoryDesignSparse {
	const { T, numTypes, binStartMs } = binnedData
	const { B, edgesMs } = lagBins

	const rowData: Array<Array<{ col: number; val: number }>> = []

	const ptrLow: number[][] = []
	const ptrHigh: number[][] = []
	for (let i = 0; i < numTypes; i++) {
		ptrLow.push(new Array(B).fill(0))
		ptrHigh.push(new Array(B).fill(0))
	}

	for (let t = 0; t < T; t++) {
		const refTime = binStartMs[t]
		const row: Array<{ col: number; val: number }> = []

		for (let i = 0; i < numTypes; i++) {
			const eventTimes = eventTimesPerType[i]
			const n = eventTimes.length
			if (n === 0) {
				continue
			}

			for (let b = 0; b < B; b++) {
				const lagLow = edgesMs[b]
				const lagHigh = edgesMs[b + 1]

				const windowStart = refTime - lagHigh
				const windowEnd = refTime - lagLow

				while (ptrLow[i][b] < n && eventTimes[ptrLow[i][b]] < windowStart) {
					ptrLow[i][b]++
				}
				while (ptrHigh[i][b] < n && eventTimes[ptrHigh[i][b]] < windowEnd) {
					ptrHigh[i][b]++
				}

				const count = ptrHigh[i][b] - ptrLow[i][b]
				if (count > 0) {
					const col = i * B + b
					row.push({ col, val: Math.min(count, 65535) })
				}
			}
		}

		rowData.push(row)
	}

	let nnz = 0
	for (const row of rowData) {
		nnz += row.length
	}

	const rowPtr = new Int32Array(T + 1)
	const colIdx = new Int32Array(nnz)
	const val = new Uint16Array(nnz)

	let ptr = 0
	for (let t = 0; t < T; t++) {
		rowPtr[t] = ptr
		for (const entry of rowData[t]) {
			colIdx[ptr] = entry.col
			val[ptr] = entry.val
			ptr++
		}
	}
	rowPtr[T] = ptr

	return { type: 'sparse', rowPtr, colIdx, val, T, numTypes, B, basis, decayByScaleBin, interactDecayByBin }
}

export function buildHistoryDesign (
	binnedData: BinnedData,
	eventTimesPerType: Float64Array[],
	lagBins: LagBins,
	basis: LagBasis,
	decayByScaleBin?: Float32Array,
	interactDecayByBin?: Float32Array,
	useSparse: boolean = true
): HistoryDesign {
	const { T, numTypes } = binnedData
	const { B } = lagBins

	const estimatedDense = T * numTypes * B * 2
	const threshold = 100 * 1024 * 1024

	if (useSparse || estimatedDense > threshold) {
		return buildHistoryDesignSparse(binnedData, eventTimesPerType, lagBins, basis, decayByScaleBin, interactDecayByBin)
	}

	return buildHistoryDesignDense(binnedData, eventTimesPerType, lagBins, basis, decayByScaleBin, interactDecayByBin)
}

export function getHistoryValue (
	history: HistoryDesign,
	t: number,
	sourceType: number,
	lagBin: number
): number {
	if (history.type === 'dense') {
		const idx = (t * history.numTypes + sourceType) * history.B + lagBin
		return history.H[idx]
	}

	const col = sourceType * history.B + lagBin
	const start = history.rowPtr[t]
	const end = history.rowPtr[t + 1]

	for (let i = start; i < end; i++) {
		if (history.colIdx[i] === col) {
			return history.val[i]
		}
		if (history.colIdx[i] > col) {
			break
		}
	}

	return 0
}

export function getHistoryRow (
	history: HistoryDesign,
	t: number
): { cols: Int32Array; vals: Uint16Array } | Float32Array {
	if (history.type === 'dense') {
		const start = t * history.numTypes * history.B
		const end = start + history.numTypes * history.B
		return new Float32Array(history.H.subarray(start, end))
	}

	const start = history.rowPtr[t]
	const end = history.rowPtr[t + 1]

	return {
		cols: history.colIdx.subarray(start, end),
		vals: history.val.subarray(start, end)
	}
}

export function computeHistoryDotProduct (
	history: HistoryDesign,
	t: number,
	weights: Float32Array,
	targetType: number
): number {
	const { numTypes, B, basis } = history
	const J = basis.J
	const phi = basis.phiByBin

	if (history.type === 'dense') {
		let sum = 0
		for (let i = 0; i < numTypes; i++) {
			if (i === targetType) {
				continue
			}
			const aOff = i * J
			for (let b = 0; b < B; b++) {
				const c = history.H[(t * numTypes + i) * B + b]
				if (c === 0) { continue }
				let w = 0
				const pOff = b * J
				for (let j = 0; j < J; j++) {
					w += weights[aOff + j] * phi[pOff + j]
				}
				sum += c * w
			}
		}
		return sum
	}

	let sum = 0
	const start = history.rowPtr[t]
	const end = history.rowPtr[t + 1]

	for (let idx = start; idx < end; idx++) {
		const col = history.colIdx[idx]
		const i = (col / B) | 0
		if (i === targetType) {
			continue
		}
		const b = col - i * B
		const c = history.val[idx]
		const aOff = i * J
		const pOff = b * J
		let w = 0
		for (let j = 0; j < J; j++) {
			w += weights[aOff + j] * phi[pOff + j]
		}
		sum += c * w
	}

	return sum
}

export function computeHistoryDotProductLegacy (
	history: HistoryDesign,
	t: number,
	weights: Float32Array,
	targetType: number
): number {
	const { numTypes, B } = history

	if (history.type === 'dense') {
		let sum = 0
		for (let i = 0; i < numTypes; i++) {
			if (i === targetType) {
				continue
			}
			for (let b = 0; b < B; b++) {
				const hIdx = (t * numTypes + i) * B + b
				const wIdx = i * B + b
				sum += history.H[hIdx] * weights[wIdx]
			}
		}
		return sum
	}

	let sum = 0
	const start = history.rowPtr[t]
	const end = history.rowPtr[t + 1]

	for (let j = start; j < end; j++) {
		const col = history.colIdx[j]
		const sourceType = (col / B) | 0
		if (sourceType === targetType) {
			continue
		}
		sum += history.val[j] * weights[col]
	}

	return sum
}

export interface UnifiedRowResult {
	edgeDot: number
	selfSums: Float32Array
	globalSums: Float32Array
	decayedByType: Float32Array
}

export function traverseHistoryRowUnified (
	history: HistoryDesign,
	t: number,
	targetType: number,
	edgeWeights: Float32Array,
	J: number,
	phi: Float32Array,
	decayByScaleBin: Float32Array | undefined,
	D: number,
	interactDecayByBin: Float32Array | undefined,
	selfSumsOut: Float32Array,
	globalSumsOut: Float32Array,
	decayedByTypeOut: Float32Array
): number {
	const { B } = history
	let edgeDot = 0

	selfSumsOut.fill(0)
	globalSumsOut.fill(0)
	decayedByTypeOut.fill(0)

	if (history.type === 'dense') {
		const { numTypes, H } = history
		for (let i = 0; i < numTypes; i++) {
			const base = (t * numTypes + i) * B
			for (let b = 0; b < B; b++) {
				const c = H[base + b]
				if (c === 0) continue

				if (i !== targetType) {
					const aOff = i * J
					const pOff = b * J
					for (let j = 0; j < J; j++) {
						edgeDot += c * edgeWeights[aOff + j] * phi[pOff + j]
					}
				}

				if (decayByScaleBin) {
					for (let d = 0; d < D; d++) {
						const contrib = c * decayByScaleBin[d * B + b]
						globalSumsOut[d] += contrib
						if (i === targetType) selfSumsOut[d] += contrib
					}
				}

				if (interactDecayByBin) {
					decayedByTypeOut[i] += c * interactDecayByBin[b]
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

			if (i !== targetType) {
				const aOff = i * J
				const pOff = b * J
				for (let j = 0; j < J; j++) {
					edgeDot += c * edgeWeights[aOff + j] * phi[pOff + j]
				}
			}

			if (decayByScaleBin) {
				for (let d = 0; d < D; d++) {
					const contrib = c * decayByScaleBin[d * B + b]
					globalSumsOut[d] += contrib
					if (i === targetType) selfSumsOut[d] += contrib
				}
			}

			if (interactDecayByBin) {
				decayedByTypeOut[i] += c * interactDecayByBin[b]
			}
		}
	}

	return edgeDot
}

export function computeEdgeGradientsFromRow (
	history: HistoryDesign,
	t: number,
	targetType: number,
	residual: number,
	J: number,
	phi: Float32Array,
	gradEdge: Float32Array
): void {
	const { B } = history

	if (history.type === 'dense') {
		const { numTypes, H } = history
		for (let i = 0; i < numTypes; i++) {
			if (i === targetType) continue
			const aOff = i * J
			const base = (t * numTypes + i) * B
			for (let b = 0; b < B; b++) {
				const c = H[base + b]
				if (c === 0) continue
				const pOff = b * J
				const cr = c * residual
				for (let j = 0; j < J; j++) {
					gradEdge[aOff + j] -= cr * phi[pOff + j]
				}
			}
		}
	} else {
		const start = history.rowPtr[t]
		const end = history.rowPtr[t + 1]
		for (let idx = start; idx < end; idx++) {
			const col = history.colIdx[idx]
			const i = (col / B) | 0
			if (i === targetType) continue
			const b = col - i * B
			const c = history.val[idx]
			const aOff = i * J
			const pOff = b * J
			const cr = c * residual
			for (let j = 0; j < J; j++) {
				gradEdge[aOff + j] -= cr * phi[pOff + j]
			}
		}
	}
}
