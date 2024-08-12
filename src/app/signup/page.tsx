'use client'

import axios from 'axios'
import React, { useCallback, type ReactElement } from 'react'

export default function Page(): ReactElement {
	const API_URL = process.env.NEXT_PUBLIC_API_URL

	const postUser = useCallback(async (user: any) => {
		try {
			const response = await axios.post(`${API_URL}/v1/users`, user)
			console.log(response.status)
			console.log(response.data)
		} catch (error: any) {
			console.error(error)
		}
	}, [API_URL])

	const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()  // Prevent default form submission
		const formData = new FormData(event.currentTarget)
		const user = {
			userName: formData.get('name'),
			email: formData.get('email'),
			password: formData.get('password'),
			confirmPassword: formData.get('confirmPassword')
		}
		await postUser(user)
	}, [])

	return (
		<main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-black">
			<form className="w-full max-w-sm flex flex-col justify-between space-y-5" onSubmit={handleSubmit}>
				<div className='space-y-2'>
					<label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
					<input type="text" id="name" name="name" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
					<input type="email" id="email" name="email" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
					<input type="password" id="password" name="password" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div className="space-y-2">
					<label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm Password</label>
					<input type="password" id="confirmPassword" name="confirmPassword" className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
				</div>
				<div>
					<button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Sign Up</button>
				</div>
			</form>
		</main>
	)
}
