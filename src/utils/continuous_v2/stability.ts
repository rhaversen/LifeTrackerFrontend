import { fitSwitchingModel, type SwitchingModelConfig, getEdgeBasisCoeffs } from './switchingModel'
import { computeKernelByBin } from './basis'
import { buildSparseMotifMatrix } from './motifs'
import type {
	BinnedData,
	BaselineDesign,
	HistoryDesign,
	MotifSet,
	ObservationWindow,
	FitResult,
	StabilityResult,
	ModelRuntime,
	LagBasis,
	ProgressCallback
} from './types'

export interface StabilityConfig {
	runs: number
	subsampleRatio: number
	fastEM: {
		maxIter: number
		maxMstepIter: number
	}
}

export function runStabilitySelection (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	windows: ObservationWindow[],
	modelConfig: SwitchingModelConfig,
	stabilityConfig: StabilityConfig,
	runtime?: ModelRuntime,
	onProgress?: ProgressCallback
): StabilityResult {
	const { T, numTypes } = binnedData
	const { B, basis } = history
	const { M } = motifSet
	const { R } = modelConfig
	const { runs, subsampleRatio, fastEM } = stabilityConfig

	const numEdges = numTypes * numTypes
	const edgeFrequencies = new Float32Array(numEdges)
	const edgeSums = new Float32Array(numEdges * B)
	const motifFrequencies = new Float32Array(M)

	const fastConfig: SwitchingModelConfig = {
		...modelConfig,
		em: {
			...modelConfig.em,
			maxIter: fastEM.maxIter,
			maxMstepIter: fastEM.maxMstepIter
		}
	}

	const numWindows = windows.length
	const sampleSize = Math.max(1, Math.floor(numWindows * subsampleRatio))

	const windowBinRanges: Array<{ start: number; end: number }> = []
	let binIdx = 0
	for (let wi = 0; wi < numWindows; wi++) {
		const windowEnd = windows[wi].endMs
		const rangeStart = binIdx
		while (binIdx < T && binnedData.binStartMs[binIdx] < windowEnd) {
			binIdx++
		}
		windowBinRanges.push({ start: rangeStart, end: binIdx })
	}

	for (let run = 0; run < runs; run++) {
		const progress = Math.round((run / runs) * 100)
		onProgress?.('Stability selection', progress, `Run ${run + 1}/${runs}`)

		const subsampledData = subsampleByWindowsCached(
			binnedData,
			baseline,
			history,
			motifSet,
			windowBinRanges,
			numWindows,
			sampleSize
		)

		const result = fitSwitchingModel(
			subsampledData.binnedData,
			subsampledData.baseline,
			subsampledData.history,
			subsampledData.motifSet,
			fastConfig,
			runtime
		)

		accumulateStats(
			result,
			numTypes,
			B,
			M,
			R,
			edgeFrequencies,
			edgeSums,
			motifFrequencies,
			basis
		)
	}

	for (let i = 0; i < numEdges; i++) {
		edgeFrequencies[i] /= runs
	}

	for (let i = 0; i < numEdges * B; i++) {
		edgeSums[i] /= runs
	}

	for (let m = 0; m < M; m++) {
		motifFrequencies[m] /= runs
	}

	return {
		edgeFrequencies,
		motifFrequencies,
		edgeMeans: edgeSums,
		runs
	}
}

interface SubsampledData {
	binnedData: BinnedData
	baseline: BaselineDesign
	history: HistoryDesign
	motifSet: MotifSet
}

function subsampleByWindowsCached (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	windowBinRanges: Array<{ start: number; end: number }>,
	numWindows: number,
	sampleSize: number
): SubsampledData {
	const selectedWindows = new Set<number>()
	while (selectedWindows.size < sampleSize) {
		const idx = Math.floor(Math.random() * numWindows)
		selectedWindows.add(idx)
	}

	const selectedBins: number[] = []
	for (const wi of selectedWindows) {
		const range = windowBinRanges[wi]
		for (let t = range.start; t < range.end; t++) {
			selectedBins.push(t)
		}
	}
	selectedBins.sort((a, b) => a - b)

	return createSubsampledData(
		binnedData,
		baseline,
		history,
		motifSet,
		selectedBins
	)
}
		baseline,
		history,
		motifSet,
		selectedBins
	)
}

function createSubsampledData (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	selectedBins: number[]
): SubsampledData {
	const newT = selectedBins.length
	const { numTypes, typeNames, typeIndex } = binnedData
	const { P } = baseline
	const { B } = history
	const { M } = motifSet

	const newBinStartMs = new Float64Array(newT)
	const newDtHours = new Float32Array(newT)
	const newY = new Uint16Array(newT * numTypes)
	const newEventCountsByType = new Uint32Array(numTypes)

	for (let i = 0; i < newT; i++) {
		const oldT = selectedBins[i]
		newBinStartMs[i] = binnedData.binStartMs[oldT]
		newDtHours[i] = binnedData.dtHours[oldT]

		for (let k = 0; k < numTypes; k++) {
			const count = binnedData.y[oldT * numTypes + k]
			newY[i * numTypes + k] = count
			newEventCountsByType[k] += count
		}
	}

	const newBinnedData: BinnedData = {
		T: newT,
		numTypes,
		binStartMs: newBinStartMs,
		dtHours: newDtHours,
		y: newY,
		typeNames,
		typeIndex,
		eventCountsByType: newEventCountsByType
	}

	const newX = new Float32Array(newT * P)
	for (let i = 0; i < newT; i++) {
		const oldT = selectedBins[i]
		for (let p = 0; p < P; p++) {
			newX[i * P + p] = baseline.X[oldT * P + p]
		}
	}
	const newBaseline: BaselineDesign = { P, X: newX }

	let newHistory: HistoryDesign

	if (history.type === 'dense') {
		const newH = new Uint16Array(newT * numTypes * B)
		for (let i = 0; i < newT; i++) {
			const oldT = selectedBins[i]
			for (let j = 0; j < numTypes * B; j++) {
				newH[i * numTypes * B + j] = history.H[oldT * numTypes * B + j]
			}
		}
		newHistory = {
			type: 'dense',
			H: newH,
			T: newT,
			numTypes,
			B,
			basis: history.basis,
			decayByScaleBin: history.decayByScaleBin,
			interactDecayByBin: history.interactDecayByBin
		}
	} else {
		const rows: Array<Array<{ col: number; val: number }>> = []
		for (let i = 0; i < newT; i++) {
			const oldT = selectedBins[i]
			const start = history.rowPtr[oldT]
			const end = history.rowPtr[oldT + 1]
			const row: Array<{ col: number; val: number }> = []
			for (let j = start; j < end; j++) {
				row.push({ col: history.colIdx[j], val: history.val[j] })
			}
			rows.push(row)
		}

		let nnz = 0
		for (const row of rows) {
			nnz += row.length
		}

		const newRowPtr = new Int32Array(newT + 1)
		const newColIdx = new Int32Array(nnz)
		const newVal = new Uint16Array(nnz)

		let ptr = 0
		for (let i = 0; i < newT; i++) {
			newRowPtr[i] = ptr
			for (const entry of rows[i]) {
				newColIdx[ptr] = entry.col
				newVal[ptr] = entry.val
				ptr++
			}
		}
		newRowPtr[newT] = ptr

		newHistory = {
			type: 'sparse',
			rowPtr: newRowPtr,
			colIdx: newColIdx,
			val: newVal,
			T: newT,
			numTypes,
			B,
			basis: history.basis,
			decayByScaleBin: history.decayByScaleBin,
			interactDecayByBin: history.interactDecayByBin
		}
	}

	let newMotifSet: MotifSet
	if (M > 0) {
		const newMmat = new Uint8Array(newT * M)
		for (let i = 0; i < newT; i++) {
			const oldT = selectedBins[i]
			for (let m = 0; m < M; m++) {
				newMmat[i * M + m] = motifSet.Mmat[oldT * M + m]
			}
		}
		const { sparseRowPtr, sparseColIdx, sparseVal } = buildSparseMotifMatrix(newMmat, newT, M)
		newMotifSet = { motifs: motifSet.motifs, M, Mmat: newMmat, T: newT, sparseRowPtr, sparseColIdx, sparseVal }
	} else {
		newMotifSet = { motifs: [], M: 0, Mmat: new Uint8Array(0), T: newT }
	}

	return {
		binnedData: newBinnedData,
		baseline: newBaseline,
		history: newHistory,
		motifSet: newMotifSet
	}
}

function accumulateStats (
	result: FitResult,
	numTypes: number,
	B: number,
	M: number,
	R: number,
	edgeFrequencies: Float32Array,
	edgeSums: Float32Array,
	motifFrequencies: Float32Array,
	basis: LagBasis
): void {
	const { params, gamma } = result
	const T = gamma.length / R

	const occupancy = new Float32Array(R)
	for (let t = 0; t < T; t++) {
		for (let r = 0; r < R; r++) {
			occupancy[r] += gamma[t * R + r]
		}
	}
	for (let r = 0; r < R; r++) {
		occupancy[r] /= T
	}

	for (let target = 0; target < numTypes; target++) {
		for (let source = 0; source < numTypes; source++) {
			if (source === target) { continue }

			const edgeIdx = target * numTypes + source

			let totalAbsWeight = 0
			for (let r = 0; r < R; r++) {
				const basisCoeffs = getEdgeBasisCoeffs(params, target, source, r)
				const kernelByBin = computeKernelByBin(basis, basisCoeffs)
				for (let b = 0; b < B; b++) {
					const w = kernelByBin[b] * occupancy[r]
					edgeSums[edgeIdx * B + b] += w
					totalAbsWeight += Math.abs(w)
				}
			}

			if (totalAbsWeight > 0.05) {
				edgeFrequencies[edgeIdx] += 1
			}
		}
	}

	if (M > 0) {
		for (let m = 0; m < M; m++) {
			let totalAbsWeight = 0

			for (let k = 0; k < numTypes; k++) {
				for (let r = 0; r < R; r++) {
					const coeff = params.coefficients[r]
					const weight = coeff.motifWeights[k * M + m]
					totalAbsWeight += Math.abs(weight * occupancy[r])
				}
			}

			if (totalAbsWeight > 0.05) {
				motifFrequencies[m] += 1
			}
		}
	}
}

export function getEdgeSelectionFrequency (
	stability: StabilityResult,
	targetType: number,
	sourceType: number,
	numTypes: number
): number {
	const edgeIdx = targetType * numTypes + sourceType
	return stability.edgeFrequencies[edgeIdx]
}

export function getEdgeMeanWeights (
	stability: StabilityResult,
	targetType: number,
	sourceType: number,
	numTypes: number,
	B: number
): Float32Array {
	const edgeIdx = targetType * numTypes + sourceType
	const offset = edgeIdx * B
	return stability.edgeMeans.slice(offset, offset + B) as Float32Array
}
