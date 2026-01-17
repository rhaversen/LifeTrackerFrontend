'use client'

import { type ReactElement, Suspense } from 'react'

import ResetPasswordForm from './ResetPasswordForm'

export default function Page (): ReactElement {
	return (
		<Suspense fallback={<div className="flex justify-center items-center min-h-screen">
			<div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4"></div>
			<h2 className="text-center text-gray-700 text-xl font-semibold">{'Loading...'}</h2>
			<p className="w-1/3 text-center text-gray-500">{'We&apos;re setting things up for you.'}</p>
		</div>}>
			<ResetPasswordForm />
		</Suspense>
	)
}
