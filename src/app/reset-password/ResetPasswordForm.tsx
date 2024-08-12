'use client'

import axios from 'axios'
import { useSearchParams } from 'next/navigation'
import React, { type ReactElement, useCallback } from 'react'

function ResetPasswordForm (): ReactElement {
	const API_URL = process.env.NEXT_PUBLIC_API_URL
	const searchParams = useSearchParams()
	const passwordResetCode = searchParams.get('passwordResetCode')

	const resetPassword = useCallback(async (credentials: any) => {
		try {
			console.log(credentials)
			const response = await axios.patch(`${API_URL}/v1/users/reset-password`, credentials, { withCredentials: true })
			console.log(response.status)
		} catch (error: any) {
			console.error(error)
		}
	}, [API_URL])

	const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault() // Prevent default form submission
		const formData = new FormData(event.currentTarget)
		const credentials = {
			passwordResetCode,
			password: formData.get('password'),
			confirmPassword: formData.get('confirmPassword')
		}
		resetPassword(credentials).catch(console.error)
	}, [resetPassword, passwordResetCode])

	return (
		<main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-black">
			<form className="w-full max-w-sm flex flex-col justify-between space-y-5" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<label htmlFor="password" className="block text-sm font-medium text-gray-700">New Password</label>
					<input type="password" id="password" name="password" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
					<input type="password" id="confirmPassword" name="confirmPassword" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div>
					<button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Reset Password</button>
				</div>
			</form>
		</main>
	)
}

export default ResetPasswordForm
