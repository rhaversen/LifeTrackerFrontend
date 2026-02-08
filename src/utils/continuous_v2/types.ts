export const MS_PER_HOUR = 60 * 60 * 1000
export const MS_PER_DAY = 24 * MS_PER_HOUR

export interface ObservationWindow {
	startMs: number
	endMs: number
}

export interface LagBasis {
	kind: 'histogram' | 'raised_cosine_log'
	B: number
	J: number
	phiByBin: Float32Array
	epsilonHours: number
	centers?: Float32Array
	delta?: number
}

export interface NonlinearSpec {
	D: number
	L: number
	knots: Float32Array
	scalesHours: Float32Array
}

export interface ProjIndex {
	F: number
	K: number
	rowPtr: Int32Array
	fIdx: Int16Array
	sgn: Int8Array
	norm: Float32Array
}

export interface ModelRuntime {
	basis: LagBasis
	projIndex?: ProjIndex
	nonlinearSpec?: NonlinearSpec
	decayByScaleBin?: Float32Array
	interactDecayByBin?: Float32Array
}

export interface BinnedData {
	T: number
	numTypes: number
	binStartMs: Float64Array
	dtHours: Float32Array
	y: Uint16Array | Uint32Array
	typeNames: string[]
	typeIndex: Map<string, number>
	eventCountsByType: Uint32Array
}

export interface BaselineDesign {
	P: number
	X: Float32Array
}

export interface LagBins {
	B: number
	edgesMs: Float64Array
	midsHours: Float32Array
	widthsHours: Float32Array
}

export interface HistoryDesignDense {
	type: 'dense'
	H: Uint16Array
	T: number
	numTypes: number
	B: number
	basis: LagBasis
	decayByScaleBin?: Float32Array
	interactDecayByBin?: Float32Array
}

export interface HistoryDesignSparse {
	type: 'sparse'
	rowPtr: Int32Array
	colIdx: Int32Array
	val: Uint16Array
	T: number
	numTypes: number
	B: number
	basis: LagBasis
	decayByScaleBin?: Float32Array
	interactDecayByBin?: Float32Array
}

export type HistoryDesign = HistoryDesignDense | HistoryDesignSparse

export interface MotifDef {
	id: number
	type: 'pair' | 'co-occurrence' | 'triple'
	typeIndices: number[]
	maxLagMs: number[]
	support: number
	pValue: number
}

export interface MotifSet {
	motifs: MotifDef[]
	M: number
	Mmat: Uint8Array
	T: number
	sparseRowPtr?: Int32Array
	sparseColIdx?: Int16Array
	sparseVal?: Uint8Array
}

export interface HMMParams {
	R: number
	pi: Float32Array
	A: Float32Array
}

export interface RegimeCoefficients {
	beta: Float32Array
	edgeWeights: Float32Array
	motifWeights: Float32Array
	nonlinearWeights: Float32Array
	interactWeights: Float32Array
}

export interface ModelParams {
	hmm: HMMParams
	coefficients: RegimeCoefficients[]
	numTypes: number
	P: number
	B: number
	J: number
	M: number
	G: number
	F: number
}

export interface FitResult {
	params: ModelParams
	gamma: Float32Array
	trainLogLik: number[]
	converged: boolean
}

export interface ValidationResult {
	trainLL: number
	testLL: number
	baselineTrainLL: number
	baselineTestLL: number
	llImprovement: number
	baselineImprovement: boolean
}

export interface StabilityResult {
	edgeFrequencies: Float32Array
	motifFrequencies: Float32Array
	edgeMeans: Float32Array
	runs: number
}

export interface InfluenceEdge {
	sourceType: string
	targetType: string
	sourceIndex: number
	targetIndex: number
	peakLagMs: number
	peakLagLabel: string
	massTimeMs: number
	massTimeLabel: string
	peakEffect: number
	integratedEffect: number
	hazardRatioAtPeak: number
	hazardRatioAt15m: number
	hazardRatioAt1h: number
	hazardRatioAt6h: number
	direction: 'excite' | 'inhibit' | 'neutral'
	strength: number
	selectionFreq: number
	supportSource: number
	supportTarget: number
	regimeSpecific?: Array<{
		regime: number
		occupancy: number
		weights: Float32Array
	}>
	qualityFlags: string[]
}

export interface MotifSummary {
	motif: MotifDef
	typeNames: string[]
	effectSize: number
	hazardRatio: number
	support: number
	selectionFreq: number
	qualityFlags: string[]
}

export interface BaselineSummary {
	typeName: string
	typeIndex: number
	interceptLogRate: number
	hourPeakTime: number
	hourAmplitude: number
	dowPeakDay: number
	dowAmplitude: number
}

export interface ContinuousInsight {
	id: string
	type: 'influence' | 'rhythm' | 'co-occurrence' | 'motif'
	title: string
	description: string
	effectSize: number
	peakLag: string
	confidence: number
	support: number
	metadata: Record<string, unknown>
}

export interface PipelineConfig {
	binning: {
		targetMaxBins: number
		minBinMs: number
		maxBinMs: number
	}
	lagBins: {
		B: number
		edgesHours: number[]
	}
	lagKernels: {
		kind: 'histogram' | 'raised_cosine_log'
		J: number
		epsilonHours: number
	}
	nonlinear: {
		enabled: boolean
		scalesHours: number[]
		knots: number[]
	}
	interactions: {
		enabled: boolean
		F: number
		seed: number
		decayScaleHours: number
	}
	regimes: {
		R: number
		stickyPrior: number
	}
	penalties: {
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
	}
	thresholds: {
		minEventsPerType: number
		minTargetEventsForEdges: number
		minSourceEventsForEdges: number
		minPairSupport: number
		minSelectionFreq: number
		minEffectAbs: number
	}
	stability: {
		enabled: boolean
		runs: number
		subsampleRatio: number
	}
	motifs: {
		enabled: boolean
		maxPairs: number
		maxTriples: number
		maxLagMs: number
		minPairSupport: number
		shuffleTests: number
		pValueThreshold: number
	}
	em: {
		maxIter: number
		tolerance: number
		maxMstepIter: number
		mstepTolerance: number
		etaClamp: number
	}
}

export const DEFAULT_CONFIG: PipelineConfig = {
	binning: {
		targetMaxBins: 50000,
		minBinMs: 5 * 60 * 1000,
		maxBinMs: 60 * 60 * 1000
	},
	lagBins: {
		B: 9,
		edgesHours: [0, 0.083, 0.25, 1, 4, 12, 24, 72, 168, 504]
	},
	lagKernels: {
		kind: 'histogram',
		J: 9,
		epsilonHours: 1 / 60
	},
	nonlinear: {
		enabled: false,
		scalesHours: [1, 6, 24],
		knots: [0.5, 1, 1.5, 2, 2.5]
	},
	interactions: {
		enabled: false,
		F: 16,
		seed: 1337,
		decayScaleHours: 6
	},
	regimes: {
		R: 2,
		stickyPrior: 0.1
	},
	penalties: {
		lambdaGroup: 0.05,
		lambda1: 0.01,
		lambda2: 0.001,
		lambdaMotif: 0.05,
		lambdaNonlinear: 0.05,
		lambdaInteract: 0.05,
		reweightL1: {
			enabled: false,
			eps: 1e-3,
			every: 10
		}
	},
	thresholds: {
		minEventsPerType: 10,
		minTargetEventsForEdges: 20,
		minSourceEventsForEdges: 10,
		minPairSupport: 10,
		minSelectionFreq: 0.6,
		minEffectAbs: 0.1
	},
	stability: {
		enabled: true,
		runs: 30,
		subsampleRatio: 0.7
	},
	motifs: {
		enabled: true,
		maxPairs: 500,
		maxTriples: 100,
		maxLagMs: 6 * MS_PER_HOUR,
		minPairSupport: 10,
		shuffleTests: 50,
		pValueThreshold: 0.05
	},
	em: {
		maxIter: 25,
		tolerance: 1e-4,
		maxMstepIter: 100,
		mstepTolerance: 1e-5,
		etaClamp: 20
	}
}

export type ProgressCallback = (stage: string, percent: number, detail?: string) => void
