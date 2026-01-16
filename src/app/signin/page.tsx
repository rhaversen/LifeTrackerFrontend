'use client'

import axios from 'axios'
import React, { useCallback, type ReactElement } from 'react'

export default function Page (): ReactElement {
	const API_URL = process.env.NEXT_PUBLIC_API_URL

	const login = useCallback(async (credentials: any) => {
		try {
			const response = await axios.post(`${API_URL}/v1/auth/login-local`, credentials, { withCredentials: true })
			console.log(response.status)
		} catch (error: any) {
			console.error(error)
		}
	}, [API_URL])

	const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault() // Prevent default form submission
		const formData = new FormData(event.currentTarget)
		const credentials = {
			email: formData.get('email'),
			password: formData.get('password'),
			stayLoggedIn: formData.get('stayLoggedIn') === 'on' // Convert on to boolean
		}
		login(credentials).catch(console.error)
	}, [login])

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
				<div>
					<button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{'Sign In'}</button>
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
