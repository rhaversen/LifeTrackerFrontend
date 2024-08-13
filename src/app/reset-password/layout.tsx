import { type Metadata } from 'next'

export const metadata: Metadata = {
	title: {
		template: '%s | Life Stats',
		default: 'Reset Password'
	},
	alternates: {
		canonical: 'https://life-stats.net/reset-password'
	}
}

export default function ResetPasswordLayout ({
	children
}: Readonly<{
	children: React.ReactNode
}>): React.JSX.Element {
	return <section>
		{children}
	</section>
}
