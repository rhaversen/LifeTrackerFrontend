import type { BinnedData, MotifDef, MotifSet, ObservationWindow, PipelineConfig } from './types'

interface PairCandidate {
	typeA: number
	typeB: number
	support: number
	occurrences: Array<{ timeA: number; timeB: number }>
}

interface TripleCandidate {
	typeA: number
	typeB: number
	typeC: number
	support: number
	maxLagAB: number
	maxLagBC: number
}

export function mineMotifs (
	binnedData: BinnedData,
	eventTimesPerType: Float64Array[],
	windows: ObservationWindow[],
	config: PipelineConfig['motifs']
): MotifSet {
	const { T, numTypes } = binnedData

	if (!config.enabled || numTypes < 2) {
		return {
			motifs: [],
			M: 0,
			Mmat: new Uint8Array(T * 0),
			T
		}
	}

	const pairs = minePairs(eventTimesPerType, numTypes, config.maxLagMs, config.minPairSupport)
	const filteredPairs = filterPairsBySupport(pairs, config.maxPairs)

	let validPairs = filteredPairs
	if (config.shuffleTests > 0) {
		validPairs = filterPairsByShuffleTest(
			filteredPairs,
			eventTimesPerType,
			windows,
			config.maxLagMs,
			config.shuffleTests,
			config.pValueThreshold
		)
	}

	const motifs: MotifDef[] = []
	let motifId = 0

	for (const pair of validPairs) {
		const isCoOccurrence = pair.occurrences.length > 0 &&
			pair.occurrences.every(o => Math.abs(o.timeB - o.timeA) < 15 * 60 * 1000)

		motifs.push({
			id: motifId++,
			type: isCoOccurrence ? 'co-occurrence' : 'pair',
			typeIndices: [pair.typeA, pair.typeB],
			maxLagMs: [config.maxLagMs],
			support: pair.support,
			pValue: 0
		})
	}

	if (config.maxTriples > 0 && validPairs.length > 0) {
		const triples = mineTriples(validPairs, eventTimesPerType, config.maxLagMs, config.minPairSupport)
		const filteredTriples = triples.slice(0, config.maxTriples)

		for (const triple of filteredTriples) {
			motifs.push({
				id: motifId++,
				type: 'triple',
				typeIndices: [triple.typeA, triple.typeB, triple.typeC],
				maxLagMs: [triple.maxLagAB, triple.maxLagBC],
				support: triple.support,
				pValue: 0
			})
		}
	}

	const M = motifs.length
	const Mmat = buildMotifMatrix(binnedData, motifs, eventTimesPerType, config.maxLagMs)

	const { sparseRowPtr, sparseColIdx, sparseVal } = buildSparseMotifMatrix(Mmat, T, M)

	return { motifs, M, Mmat, T, sparseRowPtr, sparseColIdx, sparseVal }
}

function minePairs (
	eventTimesPerType: Float64Array[],
	numTypes: number,
	maxLagMs: number,
	minSupport: number
): PairCandidate[] {
	const pairs: PairCandidate[] = []

	for (let a = 0; a < numTypes; a++) {
		const timesA = eventTimesPerType[a]
		if (timesA.length === 0) {
			continue
		}

		for (let b = 0; b < numTypes; b++) {
			if (a === b) {
				continue
			}

			const timesB = eventTimesPerType[b]
			if (timesB.length === 0) {
				continue
			}

			const occurrences: Array<{ timeA: number; timeB: number }> = []
			let ptrB = 0

			for (let i = 0; i < timesA.length; i++) {
				const tA = timesA[i]
				const windowEnd = tA + maxLagMs

				while (ptrB < timesB.length && timesB[ptrB] <= tA) {
					ptrB++
				}

				let j = ptrB
				while (j < timesB.length && timesB[j] < windowEnd) {
					occurrences.push({ timeA: tA, timeB: timesB[j] })
					j++
				}
			}

			if (occurrences.length >= minSupport) {
				pairs.push({
					typeA: a,
					typeB: b,
					support: occurrences.length,
					occurrences
				})
			}
		}
	}

	return pairs
}

function filterPairsBySupport (pairs: PairCandidate[], maxPairs: number): PairCandidate[] {
	pairs.sort((a, b) => b.support - a.support)
	return pairs.slice(0, maxPairs)
}

function shuffleTypesWithinWindows (
	eventTimesPerType: Float64Array[],
	windows: ObservationWindow[]
): Float64Array[] {
	const numTypes = eventTimesPerType.length
	const allEvents: Array<{ time: number; type: number; windowIdx: number }> = []

	for (let k = 0; k < numTypes; k++) {
		for (let i = 0; i < eventTimesPerType[k].length; i++) {
			const time = eventTimesPerType[k][i]
			const windowIdx = findWindowIndex(time, windows)
			if (windowIdx >= 0) {
				allEvents.push({ time, type: k, windowIdx })
			}
		}
	}

	const byWindow = new Map<number, typeof allEvents>()
	for (const e of allEvents) {
		if (!byWindow.has(e.windowIdx)) {
			byWindow.set(e.windowIdx, [])
		}
		byWindow.get(e.windowIdx)!.push(e)
	}

	for (const [, events] of byWindow) {
		const types = events.map(e => e.type)
		fisherYatesShuffle(types)
		for (let i = 0; i < events.length; i++) {
			events[i].type = types[i]
		}
	}

	const shuffled: number[][] = Array.from({ length: numTypes }, () => [])
	for (const e of allEvents) {
		shuffled[e.type].push(e.time)
	}

	return shuffled.map(arr => {
		arr.sort((a, b) => a - b)
		return new Float64Array(arr)
	})
}

function findWindowIndex (time: number, windows: ObservationWindow[]): number {
	for (let i = 0; i < windows.length; i++) {
		if (time >= windows[i].startMs && time < windows[i].endMs) {
			return i
		}
	}
	return -1
}

function fisherYatesShuffle<T> (arr: T[]): void {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const temp = arr[i]
		arr[i] = arr[j]
		arr[j] = temp
	}
}

function filterPairsByShuffleTest (
	pairs: PairCandidate[],
	eventTimesPerType: Float64Array[],
	windows: ObservationWindow[],
	maxLagMs: number,
	numShuffles: number,
	pValueThreshold: number
): PairCandidate[] {
	const result: PairCandidate[] = []

	for (const pair of pairs) {
		let exceededCount = 0

		for (let s = 0; s < numShuffles; s++) {
			const shuffled = shuffleTypesWithinWindows(eventTimesPerType, windows)
			const shuffledSupport = countPairSupport(
				shuffled[pair.typeA],
				shuffled[pair.typeB],
				maxLagMs
			)

			if (shuffledSupport >= pair.support) {
				exceededCount++
			}
		}

		const pValue = (1 + exceededCount) / (1 + numShuffles)
		if (pValue <= pValueThreshold || pair.support >= 50) {
			result.push(pair)
		}
	}

	return result
}

function countPairSupport (
	timesA: Float64Array,
	timesB: Float64Array,
	maxLagMs: number
): number {
	let count = 0
	let ptrB = 0

	for (let i = 0; i < timesA.length; i++) {
		const tA = timesA[i]
		const windowEnd = tA + maxLagMs

		while (ptrB < timesB.length && timesB[ptrB] <= tA) {
			ptrB++
		}

		let j = ptrB
		while (j < timesB.length && timesB[j] < windowEnd) {
			count++
			j++
		}
	}

	return count
}

function mineTriples (
	pairs: PairCandidate[],
	eventTimesPerType: Float64Array[],
	maxLagMs: number,
	minSupport: number
): TripleCandidate[] {
	const triples: TripleCandidate[] = []

	const pairMap = new Map<string, PairCandidate>()
	for (const pair of pairs) {
		pairMap.set(`${pair.typeA}-${pair.typeB}`, pair)
	}

	for (const pairAB of pairs) {
		const { typeA, typeB } = pairAB

		for (const pairBC of pairs) {
			if (pairBC.typeA !== typeB) {
				continue
			}
			const typeC = pairBC.typeB
			if (typeC === typeA) {
				continue
			}

			let support = 0
			const timesC = eventTimesPerType[typeC]

			for (const { timeB } of pairAB.occurrences) {
				const windowEnd = timeB + maxLagMs

				let found = false
				for (let i = 0; i < timesC.length && !found; i++) {
					if (timesC[i] > timeB && timesC[i] < windowEnd) {
						support++
						found = true
					}
				}
			}

			if (support >= minSupport) {
				triples.push({
					typeA,
					typeB,
					typeC,
					support,
					maxLagAB: maxLagMs,
					maxLagBC: maxLagMs
				})
			}
		}
	}

	triples.sort((a, b) => b.support - a.support)
	return triples
}

function buildMotifMatrix (
	binnedData: BinnedData,
	motifs: MotifDef[],
	eventTimesPerType: Float64Array[],
	horizonMs: number
): Uint8Array {
	const { T, binStartMs } = binnedData
	const M = motifs.length

	if (M === 0) {
		return new Uint8Array(0)
	}

	const Mmat = new Uint8Array(T * M)

	for (let m = 0; m < M; m++) {
		const motif = motifs[m]
		const occurrenceTimes = findMotifOccurrences(motif, eventTimesPerType)

		let ptrOcc = 0
		for (let t = 0; t < T; t++) {
			const windowStart = binStartMs[t] - horizonMs
			const windowEnd = binStartMs[t]

			while (ptrOcc < occurrenceTimes.length && occurrenceTimes[ptrOcc] < windowStart) {
				ptrOcc++
			}

			let count = 0
			let j = ptrOcc
			while (j < occurrenceTimes.length && occurrenceTimes[j] < windowEnd) {
				count++
				j++
			}

			Mmat[t * M + m] = Math.min(count, 255)
		}
	}

	return Mmat
}

function findMotifOccurrences (motif: MotifDef, eventTimesPerType: Float64Array[]): Float64Array {
	const times: number[] = []

	if (motif.type === 'pair' || motif.type === 'co-occurrence') {
		const [typeA, typeB] = motif.typeIndices
		const maxLag = motif.maxLagMs[0]
		const timesA = eventTimesPerType[typeA]
		const timesB = eventTimesPerType[typeB]

		let ptrB = 0
		for (let i = 0; i < timesA.length; i++) {
			const tA = timesA[i]
			const windowEnd = tA + maxLag

			while (ptrB < timesB.length && timesB[ptrB] <= tA) {
				ptrB++
			}

			let j = ptrB
			while (j < timesB.length && timesB[j] < windowEnd) {
				times.push(timesB[j])
				j++
			}
		}
	} else if (motif.type === 'triple') {
		const [typeA, typeB, typeC] = motif.typeIndices
		const [maxLagAB, maxLagBC] = motif.maxLagMs
		const timesA = eventTimesPerType[typeA]
		const timesB = eventTimesPerType[typeB]
		const timesC = eventTimesPerType[typeC]

		let ptrB = 0
		for (let i = 0; i < timesA.length; i++) {
			const tA = timesA[i]
			const windowEndAB = tA + maxLagAB

			while (ptrB < timesB.length && timesB[ptrB] <= tA) {
				ptrB++
			}

			let jB = ptrB
			while (jB < timesB.length && timesB[jB] < windowEndAB) {
				const tB = timesB[jB]
				const windowEndBC = tB + maxLagBC

				for (let jC = 0; jC < timesC.length; jC++) {
					if (timesC[jC] > tB && timesC[jC] < windowEndBC) {
						times.push(timesC[jC])
						break
					}
				}
				jB++
			}
		}
	}

	times.sort((a, b) => a - b)
	return new Float64Array(times)
}

export function getMotifValue (motifSet: MotifSet, t: number, m: number): number {
	if (motifSet.M === 0) {
		return 0
	}
	return motifSet.Mmat[t * motifSet.M + m]
}

export function computeMotifDotProduct (
	motifSet: MotifSet,
	t: number,
	weights: Float32Array
): number {
	if (motifSet.sparseRowPtr && motifSet.sparseColIdx && motifSet.sparseVal) {
		return computeMotifDotProductSparse(motifSet, t, weights)
	}

	const { M, Mmat } = motifSet
	let sum = 0
	for (let m = 0; m < M; m++) {
		sum += Mmat[t * M + m] * weights[m]
	}
	return sum
}

export function buildSparseMotifMatrix (
	Mmat: Uint8Array,
	T: number,
	M: number
): { sparseRowPtr: Int32Array; sparseColIdx: Int16Array; sparseVal: Uint8Array } {
	let nnz = 0
	for (let t = 0; t < T; t++) {
		for (let m = 0; m < M; m++) {
			if (Mmat[t * M + m] > 0) nnz++
		}
	}

	const sparseRowPtr = new Int32Array(T + 1)
	const sparseColIdx = new Int16Array(nnz)
	const sparseVal = new Uint8Array(nnz)

	let ptr = 0
	for (let t = 0; t < T; t++) {
		sparseRowPtr[t] = ptr
		for (let m = 0; m < M; m++) {
			const v = Mmat[t * M + m]
			if (v > 0) {
				sparseColIdx[ptr] = m
				sparseVal[ptr] = v
				ptr++
			}
		}
	}
	sparseRowPtr[T] = ptr

	return { sparseRowPtr, sparseColIdx, sparseVal }
}

function computeMotifDotProductSparse (
	motifSet: MotifSet,
	t: number,
	weights: Float32Array
): number {
	const { sparseRowPtr, sparseColIdx, sparseVal } = motifSet
	let sum = 0
	const start = sparseRowPtr![t]
	const end = sparseRowPtr![t + 1]
	for (let i = start; i < end; i++) {
		sum += sparseVal![i] * weights[sparseColIdx![i]]
	}
	return sum
}

export function computeMotifGradientsSparse (
	motifSet: MotifSet,
	t: number,
	residual: number,
	gradMotif: Float32Array
): void {
	if (!motifSet.sparseRowPtr || !motifSet.sparseColIdx || !motifSet.sparseVal) {
		const { M, Mmat } = motifSet
		for (let m = 0; m < M; m++) {
			gradMotif[m] -= Mmat[t * M + m] * residual
		}
		return
	}

	const { sparseRowPtr, sparseColIdx, sparseVal } = motifSet
	const start = sparseRowPtr[t]
	const end = sparseRowPtr[t + 1]
	for (let i = start; i < end; i++) {
		gradMotif[sparseColIdx[i]] -= sparseVal[i] * residual
	}
}
