'use client'

import axios from 'axios'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { type ReactElement, useCallback, useState } from 'react'

function ResetPasswordForm (): ReactElement {
	const API_URL = process.env.NEXT_PUBLIC_API_URL
	const router = useRouter()
	const searchParams = useSearchParams()
	const passwordResetCode = searchParams.get('passwordResetCode')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>('')
	const [success, setSuccess] = useState(false)

	const resetPassword = useCallback(async (credentials: { passwordResetCode: string | null, password: string, confirmPassword: string }) => {
		setLoading(true)
		setError('')
		setSuccess(false)
		try {
			await axios.patch(`${API_URL}/v1/users/reset-password`, credentials, { withCredentials: true })
			setSuccess(true)
			setTimeout(() => {
				router.push('/signin')
			}, 2000)
		} catch (error: unknown) {
			if (axios.isAxiosError(error) && error.response) {
				setError(error.response.data?.message ?? 'Failed to reset password')
			} else {
				setError('An error occurred. Please try again.')
			}
			console.error(error)
		} finally {
			setLoading(false)
		}
	}, [API_URL, router])

	const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const formData = new FormData(event.currentTarget)
		const password = formData.get('password')
		const confirmPassword = formData.get('confirmPassword')
		if (typeof password === 'string' && typeof confirmPassword === 'string') {
			resetPassword({ passwordResetCode, password, confirmPassword }).catch(console.error)
		}
	}, [resetPassword, passwordResetCode])

	return (
		<main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-black">
			<form className="w-full max-w-sm flex flex-col justify-between space-y-5" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<label htmlFor="password" className="block text-sm font-medium text-gray-700">{'New Password'}</label>
					<input type="password" id="password" name="password" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">{'Confirm New Password'}</label>
					<input type="password" id="confirmPassword" name="confirmPassword" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required disabled={success} />
				</div>
				{error && (
					<div className="rounded-md bg-red-50 p-4">
						<p className="text-sm text-red-800">{error}</p>
					</div>
				)}
				{success && (
					<div className="rounded-md bg-green-50 p-4">
						<p className="text-sm text-green-800">{'Password reset successfully! Redirecting to sign in...'}</p>
					</div>
				)}
				<div>
					<button type="submit" disabled={loading || success} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
						{loading ? 'Resetting...' : 'Reset Password'}
					</button>
				</div>
			</form>
		</main>
	)
}

export default ResetPasswordForm
