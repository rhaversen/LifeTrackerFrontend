import type { LagBasis, LagBins } from './types'

export function buildHistogramBasis (lagBins: LagBins): LagBasis {
	const { B } = lagBins
	const J = B
	const phiByBin = new Float32Array(B * J)
	for (let b = 0; b < B; b++) {
		phiByBin[b * J + b] = 1
	}
	return { kind: 'histogram', B, J, phiByBin, epsilonHours: 1 / 60 }
}

export function buildRaisedCosineLogBasis (lagBins: LagBins, J: number, epsilonHours: number): LagBasis {
	const { B, midsHours, edgesMs } = lagBins
	const tauMaxHours = edgesMs[edgesMs.length - 1] / (60 * 60 * 1000)

	const uMin = Math.log(epsilonHours)
	const uMax = Math.log(tauMaxHours + epsilonHours)
	const delta = (uMax - uMin) / Math.max(1, J - 1)

	const centers = new Float32Array(J)
	for (let j = 0; j < J; j++) {
		centers[j] = uMin + j * delta
	}

	const phiByBin = new Float32Array(B * J)
	for (let b = 0; b < B; b++) {
		const tau = Math.max(0, midsHours[b])
		const u = Math.log(tau + epsilonHours)
		for (let j = 0; j < J; j++) {
			const x = (u - centers[j]) / delta
			let val = 0
			if (Math.abs(x) <= 1) {
				val = 0.5 * (1 + Math.cos(Math.PI * x))
			}
			phiByBin[b * J + j] = val
		}
	}

	return { kind: 'raised_cosine_log', B, J, phiByBin, epsilonHours, centers, delta }
}

export function evaluateBasisAtLagHours (basis: LagBasis, lagHours: number): Float32Array {
	const v = new Float32Array(basis.J)

	if (basis.kind !== 'raised_cosine_log' || basis.centers === undefined || basis.delta === undefined) {
		return v
	}

	const u = Math.log(Math.max(0, lagHours) + basis.epsilonHours)
	for (let j = 0; j < basis.J; j++) {
		const x = (u - basis.centers[j]) / basis.delta
		v[j] = Math.abs(x) <= 1 ? 0.5 * (1 + Math.cos(Math.PI * x)) : 0
	}
	return v
}

export function evaluateKernelAtLagHours (basis: LagBasis, coeffs: Float32Array, lagHours: number): number {
	const phi = evaluateBasisAtLagHours(basis, lagHours)
	let sum = 0
	for (let j = 0; j < basis.J; j++) {
		sum += coeffs[j] * phi[j]
	}
	return sum
}

export function computeKernelByBin (basis: LagBasis, coeffs: Float32Array): Float32Array {
	const { B, J, phiByBin } = basis
	const kernel = new Float32Array(B)
	for (let b = 0; b < B; b++) {
		let sum = 0
		const pOff = b * J
		for (let j = 0; j < J; j++) {
			sum += coeffs[j] * phiByBin[pOff + j]
		}
		kernel[b] = sum
	}
	return kernel
}
