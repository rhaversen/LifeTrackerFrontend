import { forwardBackward } from './hmm'
import { computeTotalLogEmission } from './poissonSparse'
import type {
	BinnedData,
	BaselineDesign,
	HistoryDesign,
	MotifSet,
	FitResult,
	ValidationResult,
	ModelParams,
	ModelRuntime,
	RegimeCoefficients,
	ProgressCallback
} from './types'

export function splitTrainTestBins (
	binnedData: BinnedData,
	trainRatio: number = 0.7
): { trainIndices: Int32Array; testIndices: Int32Array } {
	const { T } = binnedData
	const splitPoint = Math.floor(T * trainRatio)

	const trainIndices = new Int32Array(splitPoint)
	const testIndices = new Int32Array(T - splitPoint)

	for (let i = 0; i < splitPoint; i++) {
		trainIndices[i] = i
	}

	for (let i = splitPoint; i < T; i++) {
		testIndices[i - splitPoint] = i
	}

	return { trainIndices, testIndices }
}

export function evaluateLogLikelihood (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	params: ModelParams,
	binIndices: Int32Array,
	runtime?: ModelRuntime
): number {
	const { numTypes, y, dtHours, binStartMs } = binnedData
	const { P, B, J, M, G, F, hmm, coefficients } = params
	const R = hmm.R

	const T = binIndices.length
	if (T === 0) { return 0 }

	const subY = new Uint16Array(T * numTypes)
	const subDtHours = new Float32Array(T)
	const subBinStartMs = new Float64Array(T)
	const subEventCounts = new Uint32Array(numTypes)

	for (let i = 0; i < T; i++) {
		const t = binIndices[i]
		subDtHours[i] = dtHours[t]
		subBinStartMs[i] = binStartMs[t]
		for (let k = 0; k < numTypes; k++) {
			const count = y[t * numTypes + k]
			subY[i * numTypes + k] = count
			subEventCounts[k] += count
		}
	}

	const subBinnedData: BinnedData = {
		T,
		numTypes,
		binStartMs: subBinStartMs,
		dtHours: subDtHours,
		y: subY,
		typeNames: binnedData.typeNames,
		typeIndex: binnedData.typeIndex,
		eventCountsByType: subEventCounts
	}

	const subX = new Float32Array(T * P)
	for (let i = 0; i < T; i++) {
		const t = binIndices[i]
		for (let p = 0; p < P; p++) {
			subX[i * P + p] = baseline.X[t * P + p]
		}
	}
	const subBaseline: BaselineDesign = { P, X: subX }

	let subHistory: HistoryDesign
	if (history.type === 'dense') {
		const subH = new Uint16Array(T * numTypes * B)
		for (let i = 0; i < T; i++) {
			const t = binIndices[i]
			for (let j = 0; j < numTypes * B; j++) {
				subH[i * numTypes * B + j] = history.H[t * numTypes * B + j]
			}
		}
		subHistory = {
			type: 'dense',
			H: subH,
			T,
			numTypes,
			B,
			basis: history.basis,
			decayByScaleBin: history.decayByScaleBin,
			interactDecayByBin: history.interactDecayByBin
		}
	} else {
		const rows: Array<Array<{ col: number; val: number }>> = []
		for (let i = 0; i < T; i++) {
			const t = binIndices[i]
			const start = history.rowPtr[t]
			const end = history.rowPtr[t + 1]
			const row: Array<{ col: number; val: number }> = []
			for (let j = start; j < end; j++) {
				row.push({ col: history.colIdx[j], val: history.val[j] })
			}
			rows.push(row)
		}

		let nnz = 0
		for (const row of rows) { nnz += row.length }

		const rowPtr = new Int32Array(T + 1)
		const colIdx = new Int32Array(nnz)
		const val = new Uint16Array(nnz)

		let ptr = 0
		for (let i = 0; i < T; i++) {
			rowPtr[i] = ptr
			for (const entry of rows[i]) {
				colIdx[ptr] = entry.col
				val[ptr] = entry.val
				ptr++
			}
		}
		rowPtr[T] = ptr

		subHistory = {
			type: 'sparse',
			rowPtr,
			colIdx,
			val,
			T,
			numTypes,
			B,
			basis: history.basis,
			decayByScaleBin: history.decayByScaleBin,
			interactDecayByBin: history.interactDecayByBin
		}
	}

	let subMotifSet: MotifSet
	if (M > 0) {
		const subMmat = new Uint8Array(T * M)
		for (let i = 0; i < T; i++) {
			const t = binIndices[i]
			for (let m = 0; m < M; m++) {
				subMmat[i * M + m] = motifSet.Mmat[t * M + m]
			}
		}
		subMotifSet = { motifs: motifSet.motifs, M, Mmat: subMmat, T }
	} else {
		subMotifSet = { motifs: [], M: 0, Mmat: new Uint8Array(0), T }
	}

	const perTypeCoeffs = new Map<number, RegimeCoefficients[]>()
	for (let k = 0; k < numTypes; k++) {
		const regimeCoeffs: RegimeCoefficients[] = []
		for (let r = 0; r < R; r++) {
			const src = coefficients[r]
			regimeCoeffs.push({
				beta: src.beta.slice(k * P, (k + 1) * P) as Float32Array,
				edgeWeights: src.edgeWeights.slice(k * numTypes * J, (k + 1) * numTypes * J) as Float32Array,
				motifWeights: src.motifWeights.slice(k * M, (k + 1) * M) as Float32Array,
				nonlinearWeights: G > 0 ? src.nonlinearWeights.slice(k * G, (k + 1) * G) as Float32Array : new Float32Array(0),
				interactWeights: F > 0 ? src.interactWeights.slice(k * F, (k + 1) * F) as Float32Array : new Float32Array(0)
			})
		}
		perTypeCoeffs.set(k, regimeCoeffs)
	}

	const logEmission = computeTotalLogEmission(
		subBinnedData,
		subBaseline,
		subHistory,
		subMotifSet,
		perTypeCoeffs,
		20,
		runtime
	)

	const fbResult = forwardBackward(logEmission, hmm)
	return fbResult.logLik
}

export function computeBaselineLogLikelihood (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	binIndices: Int32Array,
	_R: number
): number {
	const { numTypes, y, dtHours } = binnedData
	const { P: _P, X: _X } = baseline
	const T = binIndices.length

	if (T === 0) { return 0 }

	const typeRates = new Float32Array(numTypes)
	let totalDt = 0
	for (let i = 0; i < T; i++) {
		const t = binIndices[i]
		totalDt += dtHours[t]
		for (let k = 0; k < numTypes; k++) {
			typeRates[k] += y[t * numTypes + k]
		}
	}

	for (let k = 0; k < numTypes; k++) {
		if (totalDt > 0) {
			typeRates[k] = Math.log(Math.max(typeRates[k] / totalDt, 1e-10))
		} else {
			typeRates[k] = -10
		}
	}

	let ll = 0
	for (let i = 0; i < T; i++) {
		const t = binIndices[i]
		const dt = dtHours[t]

		for (let k = 0; k < numTypes; k++) {
			const eta = typeRates[k]
			const mu = dt * Math.exp(eta)
			const yVal = y[t * numTypes + k]
			ll += yVal * eta - mu
		}
	}

	return ll
}

export function validateModel (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	fitResult: FitResult,
	trainRatio: number = 0.7,
	runtime?: ModelRuntime,
	onProgress?: ProgressCallback
): ValidationResult {
	onProgress?.('Validating model', 0, 'Splitting data')

	const { trainIndices, testIndices } = splitTrainTestBins(binnedData, trainRatio)
	const R = fitResult.params.hmm.R

	onProgress?.('Validating model', 25, 'Computing train LL')
	const trainLL = evaluateLogLikelihood(
		binnedData, baseline, history, motifSet, fitResult.params, trainIndices, runtime
	)

	onProgress?.('Validating model', 50, 'Computing test LL')
	const testLL = evaluateLogLikelihood(
		binnedData, baseline, history, motifSet, fitResult.params, testIndices, runtime
	)

	onProgress?.('Validating model', 75, 'Computing baseline LL')
	const baselineTrainLL = computeBaselineLogLikelihood(binnedData, baseline, trainIndices, R)
	const baselineTestLL = computeBaselineLogLikelihood(binnedData, baseline, testIndices, R)

	const llImprovement = testLL - baselineTestLL

	onProgress?.('Validating model', 100, 'Validation complete')

	return {
		trainLL,
		testLL,
		baselineTrainLL,
		baselineTestLL,
		llImprovement,
		baselineImprovement: llImprovement > 0
	}
}

export interface CalibrationBin {
	predictedMean: number
	observedMean: number
	count: number
}

export function computeCalibrationCurve (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	fitResult: FitResult,
	targetType: number,
	numBins: number = 10
): CalibrationBin[] {
	const { T, numTypes, y, dtHours } = binnedData
	const { P, B, M, hmm, coefficients } = fitResult.params
	const R = hmm.R
	const gamma = fitResult.gamma

	const predictions: Array<{ predicted: number; observed: number }> = []

	for (let t = 0; t < T; t++) {
		let expectedRate = 0

		for (let r = 0; r < R; r++) {
			const regimeCoeffs = coefficients[r]
			const beta = regimeCoeffs.beta.slice(targetType * P, (targetType + 1) * P)

			let eta = 0
			for (let p = 0; p < P; p++) {
				eta += baseline.X[t * P + p] * beta[p]
			}

			if (history.type === 'dense') {
				for (let i = 0; i < numTypes; i++) {
					if (i === targetType) { continue }
					for (let b = 0; b < B; b++) {
						const hIdx = (t * numTypes + i) * B + b
						const wIdx = targetType * numTypes * B + i * B + b
						eta += history.H[hIdx] * regimeCoeffs.edgeWeights[wIdx]
					}
				}
			}

			if (M > 0) {
				for (let m = 0; m < M; m++) {
					eta += motifSet.Mmat[t * M + m] * regimeCoeffs.motifWeights[targetType * M + m]
				}
			}

			const mu = dtHours[t] * Math.exp(Math.max(-20, Math.min(20, eta)))
			expectedRate += gamma[t * R + r] * mu
		}

		predictions.push({
			predicted: expectedRate,
			observed: y[t * numTypes + targetType]
		})
	}

	predictions.sort((a, b) => a.predicted - b.predicted)

	const bins: CalibrationBin[] = []
	const binSize = Math.ceil(predictions.length / numBins)

	for (let i = 0; i < numBins; i++) {
		const start = i * binSize
		const end = Math.min((i + 1) * binSize, predictions.length)

		if (start >= predictions.length) { break }

		let predSum = 0
		let obsSum = 0
		let count = 0

		for (let j = start; j < end; j++) {
			predSum += predictions[j].predicted
			obsSum += predictions[j].observed
			count++
		}

		if (count > 0) {
			bins.push({
				predictedMean: predSum / count,
				observedMean: obsSum / count,
				count
			})
		}
	}

	return bins
}

export function computeResidualDiagnostics (
	binnedData: BinnedData,
	baseline: BaselineDesign,
	history: HistoryDesign,
	motifSet: MotifSet,
	fitResult: FitResult
): Map<number, { meanResidual: number; stdResidual: number; calibrationError: number }> {
	const { numTypes, typeNames: _typeNames } = binnedData
	const diagnostics = new Map<number, { meanResidual: number; stdResidual: number; calibrationError: number }>()

	for (let k = 0; k < numTypes; k++) {
		const calibration = computeCalibrationCurve(
			binnedData, baseline, history, motifSet, fitResult, k, 10
		)

		let totalError = 0
		let totalCount = 0

		for (const bin of calibration) {
			const error = Math.abs(bin.predictedMean - bin.observedMean)
			totalError += error * bin.count
			totalCount += bin.count
		}

		const calibrationError = totalCount > 0 ? totalError / totalCount : 0

		diagnostics.set(k, {
			meanResidual: 0,
			stdResidual: 1,
			calibrationError
		})
	}

	return diagnostics
}
