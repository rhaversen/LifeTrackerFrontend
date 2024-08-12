import { type Metadata } from 'next'

export const metadata: Metadata = {
	title: {
		template: '%s | Life Stats',
		default: 'Sign In'
	},
	alternates: {
		canonical: 'https://life-stats.net/signin'
	}
}

export default function SigninLayout ({
	children
}: Readonly<{
	children: React.ReactNode
}>): React.JSX.Element {
	return <section>
		{children}
	</section>
}
