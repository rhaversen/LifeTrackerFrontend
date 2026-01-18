'use client'

import axios from 'axios'
import React, { useCallback, useState, type ReactElement } from 'react'

export default function Page (): ReactElement {
	const API_URL = process.env.NEXT_PUBLIC_API_URL
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>('')
	const [success, setSuccess] = useState(false)

	const requestPasswordReset = useCallback(async (credentials: { email: string }) => {
		setLoading(true)
		setError('')
		setSuccess(false)
		try {
			await axios.post(`${API_URL}/v1/users/request-password-reset-email`, credentials)
			setSuccess(true)
		} catch (error: unknown) {
			if (axios.isAxiosError(error) && error.response) {
				setError(error.response.data?.message ?? 'Failed to request password reset')
			} else {
				setError('An error occurred. Please try again.')
			}
			console.error(error)
		} finally {
			setLoading(false)
		}
	}, [API_URL])

	const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault() // Prevent default form submission
		const formData = new FormData(event.currentTarget)
		const email = formData.get('email')
		if (typeof email === 'string') {
			requestPasswordReset({ email }).catch(console.error)
		}
	}, [requestPasswordReset])

	return (
		<main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-black">
			<form className="w-full max-w-sm flex flex-col justify-between space-y-5" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<label htmlFor="email" className="block text-sm font-medium text-gray-700">{'Email'}</label>
					<input type="email" id="email" name="email" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required disabled={success} />
				</div>
				{error && (
					<div className="rounded-md bg-red-50 p-4">
						<p className="text-sm text-red-800">{error}</p>
					</div>
				)}
				{success && (
					<div className="rounded-md bg-green-50 p-4">
						<p className="text-sm text-green-800">{'Password reset email sent! Check your inbox for instructions.'}</p>
					</div>
				)}
				<div>
					<button type="submit" disabled={loading || success} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
						{loading ? 'Sending...' : 'Request Password Reset'}
					</button>
				</div>
			</form>
			<div className="mt-4">
				<p className="text-sm text-gray-600">{'Remember your password? '}<a href="/signin" className="font-medium text-indigo-600 hover:text-indigo-500">{'Sign In'}</a></p>
			</div>
		</main>
	)
}
