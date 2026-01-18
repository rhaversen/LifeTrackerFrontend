'use client'

import axios from 'axios'
import { useRouter } from 'next/navigation'
import React, { useCallback, useState, type ReactElement } from 'react'

export default function Page (): ReactElement {
	const API_URL = process.env.NEXT_PUBLIC_API_URL
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>('')

	const signin = useCallback(async (credentials: { email: string, password: string, stayLoggedIn: boolean }) => {
		setLoading(true)
		setError('')
		try {
			await axios.post(`${API_URL}/v1/auth/login-local`, credentials, { withCredentials: true })
			router.push('/')
		} catch (error: unknown) {
			if (axios.isAxiosError(error) && error.response) {
				setError(error.response.data?.message || 'Invalid email or password')
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
		const email = formData.get('email')
		const password = formData.get('password')
		const stayLoggedIn = formData.get('stayLoggedIn') === 'on'
		if (typeof email === 'string' && typeof password === 'string') {
			signin({ email, password, stayLoggedIn }).catch(console.error)
		}
	}, [signin])

	return (
		<main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-black">
			<form className="w-full max-w-sm flex flex-col justify-between space-y-5" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<label htmlFor="email" className="block text-sm font-medium text-gray-700">{'Email'}</label>
					<input type="email" id="email" name="email" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="password" className="block text-sm font-medium text-gray-700">{'Password'}</label>
					<input type="password" id="password" name="password" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="stayLoggedIn" className="flex items-center">
						<input type="checkbox" id="stayLoggedIn" name="stayLoggedIn" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
						<span className="ml-2 block text-sm text-gray-900">{'Stay logged in'}</span>
					</label>
				</div>
			{error && (
				<div className="rounded-md bg-red-50 p-4">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}
			<div>
				<button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
					{loading ? 'Signing in...' : 'Sign In'}
				</button>
				</div>
			</form>
			<div className="mt-4">
				<p className="text-sm text-gray-600">{'Forgot password? '}<a href="/request-password-reset" className="font-medium text-indigo-600 hover:text-indigo-500">{'Reset it'}</a></p>
			</div>
			<div className="mt-4">
				<p className="text-sm text-gray-600">{'Don&apos;t have an account? '}<a href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">{'Sign Up'}</a></p>
			</div>
		</main>
	)
}
