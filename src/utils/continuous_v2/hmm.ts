import type { HMMParams } from './types'

export interface ForwardBackwardResult {
	gamma: Float32Array
	xiSum: Float32Array
	logLik: number
}

function logSumExp (arr: Float32Array, start: number, len: number): number {
	let maxVal = -Infinity
	for (let i = 0; i < len; i++) {
		if (arr[start + i] > maxVal) {
			maxVal = arr[start + i]
		}
	}

	if (!isFinite(maxVal)) {
		return -Infinity
	}

	let sum = 0
	for (let i = 0; i < len; i++) {
		sum += Math.exp(arr[start + i] - maxVal)
	}

	return maxVal + Math.log(sum)
}

function logSumExpPair (a: number, b: number): number {
	if (!isFinite(a)) { return b }
	if (!isFinite(b)) { return a }

	const maxVal = Math.max(a, b)
	return maxVal + Math.log(Math.exp(a - maxVal) + Math.exp(b - maxVal))
}

export function forwardBackward (
	logEmission: Float32Array,
	hmm: HMMParams
): ForwardBackwardResult {
	const { R, pi, A } = hmm
	const T = logEmission.length / R

	const alpha = new Float32Array(T * R)
	const beta = new Float32Array(T * R)
	const gamma = new Float32Array(T * R)
	const xiSum = new Float32Array(R * R)

	const logPi = new Float32Array(R)
	const logA = new Float32Array(R * R)

	for (let r = 0; r < R; r++) {
		logPi[r] = Math.log(Math.max(pi[r], 1e-10))
	}

	for (let r = 0; r < R; r++) {
		for (let s = 0; s < R; s++) {
			logA[r * R + s] = Math.log(Math.max(A[r * R + s], 1e-10))
		}
	}

	for (let r = 0; r < R; r++) {
		alpha[r] = logPi[r] + logEmission[r]
	}

	const tempAlpha = new Float32Array(R)
	for (let t = 1; t < T; t++) {
		for (let s = 0; s < R; s++) {
			let logSum = -Infinity
			for (let r = 0; r < R; r++) {
				const val = alpha[(t - 1) * R + r] + logA[r * R + s]
				logSum = logSumExpPair(logSum, val)
			}
			tempAlpha[s] = logSum + logEmission[t * R + s]
		}
		for (let s = 0; s < R; s++) {
			alpha[t * R + s] = tempAlpha[s]
		}
	}

	for (let r = 0; r < R; r++) {
		beta[(T - 1) * R + r] = 0
	}

	const tempBeta = new Float32Array(R)
	for (let t = T - 2; t >= 0; t--) {
		for (let r = 0; r < R; r++) {
			let logSum = -Infinity
			for (let s = 0; s < R; s++) {
				const val = logA[r * R + s] + logEmission[(t + 1) * R + s] + beta[(t + 1) * R + s]
				logSum = logSumExpPair(logSum, val)
			}
			tempBeta[r] = logSum
		}
		for (let r = 0; r < R; r++) {
			beta[t * R + r] = tempBeta[r]
		}
	}

	const logLik = logSumExp(alpha, (T - 1) * R, R)

	const logGammaUnnorm = new Float32Array(R)
	for (let t = 0; t < T; t++) {
		const off = t * R
		for (let r = 0; r < R; r++) {
			logGammaUnnorm[r] = alpha[off + r] + beta[off + r]
		}
		const logNorm = logSumExp(logGammaUnnorm, 0, R)
		for (let r = 0; r < R; r++) {
			gamma[off + r] = Math.exp(logGammaUnnorm[r] - logNorm)
		}
	}

	const logXiUnnorm = new Float32Array(R * R)
	for (let t = 0; t < T - 1; t++) {
		const off = t * R
		const off1 = (t + 1) * R
		for (let r = 0; r < R; r++) {
			const a = alpha[off + r]
			const row = r * R
			for (let s = 0; s < R; s++) {
				logXiUnnorm[row + s] = a + logA[row + s] + logEmission[off1 + s] + beta[off1 + s]
			}
		}
		const logNorm = logSumExp(logXiUnnorm, 0, R * R)
		for (let i = 0; i < R * R; i++) {
			xiSum[i] += Math.exp(logXiUnnorm[i] - logNorm)
		}
	}

	return { gamma, xiSum, logLik }
}

export function updateHMMParams (
	gamma: Float32Array,
	xiSum: Float32Array,
	R: number,
	T: number,
	stickyPrior: number = 0.1
): HMMParams {
	const newPi = new Float32Array(R)
	const newA = new Float32Array(R * R)

	for (let r = 0; r < R; r++) {
		newPi[r] = gamma[r]
	}

	let piSum = 0
	for (let r = 0; r < R; r++) piSum += newPi[r]
	for (let r = 0; r < R; r++) {
		newPi[r] /= piSum
		newPi[r] = Math.max(newPi[r], 1e-6)
	}

	for (let r = 0; r < R; r++) {
		let gammaSum = 0
		for (let t = 0; t < T - 1; t++) {
			gammaSum += gamma[t * R + r]
		}

		for (let s = 0; s < R; s++) {
			if (gammaSum > 0) {
				newA[r * R + s] = xiSum[r * R + s] / gammaSum
			} else {
				newA[r * R + s] = 1.0 / R
			}
		}
	}

	if (stickyPrior > 0) {
		for (let r = 0; r < R; r++) {
			let rowSum = 0
			for (let s = 0; s < R; s++) {
				const mixed = (1 - stickyPrior) * newA[r * R + s] + (r === s ? stickyPrior : 0)
				newA[r * R + s] = Math.max(mixed, 1e-6)
				rowSum += newA[r * R + s]
			}
			for (let s = 0; s < R; s++) {
				newA[r * R + s] /= rowSum
			}
		}
	} else {
		for (let r = 0; r < R; r++) {
			let rowSum = 0
			for (let s = 0; s < R; s++) {
				newA[r * R + s] = Math.max(newA[r * R + s], 1e-6)
				rowSum += newA[r * R + s]
			}
			for (let s = 0; s < R; s++) {
				newA[r * R + s] /= rowSum
			}
		}
	}

	return { R, pi: newPi, A: newA }
}

export function initializeHMMParams (R: number, stickyDiag: number = 0.9): HMMParams {
	const pi = new Float32Array(R)
	const A = new Float32Array(R * R)

	for (let r = 0; r < R; r++) {
		pi[r] = 1.0 / R
	}

	const offDiag = (1 - stickyDiag) / (R - 1)
	for (let r = 0; r < R; r++) {
		for (let s = 0; s < R; s++) {
			A[r * R + s] = r === s ? stickyDiag : offDiag
		}
	}

	return { R, pi, A }
}

export function computeAverageOccupancy (gamma: Float32Array, R: number, T: number): Float32Array {
	const occupancy = new Float32Array(R)

	for (let t = 0; t < T; t++) {
		for (let r = 0; r < R; r++) {
			occupancy[r] += gamma[t * R + r]
		}
	}

	for (let r = 0; r < R; r++) {
		occupancy[r] /= T
	}

	return occupancy
}

export function viterbiDecode (
	logEmission: Float32Array,
	hmm: HMMParams
): Int32Array {
	const { R, pi, A } = hmm
	const T = logEmission.length / R

	const logPi = new Float32Array(R)
	const logA = new Float32Array(R * R)

	for (let r = 0; r < R; r++) {
		logPi[r] = Math.log(Math.max(pi[r], 1e-10))
	}

	for (let r = 0; r < R; r++) {
		for (let s = 0; s < R; s++) {
			logA[r * R + s] = Math.log(Math.max(A[r * R + s], 1e-10))
		}
	}

	const delta = new Float32Array(T * R)
	const psi = new Int32Array(T * R)

	for (let r = 0; r < R; r++) {
		delta[r] = logPi[r] + logEmission[r]
		psi[r] = 0
	}

	for (let t = 1; t < T; t++) {
		for (let s = 0; s < R; s++) {
			let maxVal = -Infinity
			let maxArg = 0

			for (let r = 0; r < R; r++) {
				const val = delta[(t - 1) * R + r] + logA[r * R + s]
				if (val > maxVal) {
					maxVal = val
					maxArg = r
				}
			}

			delta[t * R + s] = maxVal + logEmission[t * R + s]
			psi[t * R + s] = maxArg
		}
	}

	const path = new Int32Array(T)

	let maxVal = -Infinity
	let maxArg = 0
	for (let r = 0; r < R; r++) {
		if (delta[(T - 1) * R + r] > maxVal) {
			maxVal = delta[(T - 1) * R + r]
			maxArg = r
		}
	}
	path[T - 1] = maxArg

	for (let t = T - 2; t >= 0; t--) {
		path[t] = psi[(t + 1) * R + path[t + 1]]
	}

	return path
}
