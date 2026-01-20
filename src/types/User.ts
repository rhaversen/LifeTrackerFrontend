export interface User {
	_id: string
	userName: string
	email: string
	accessToken: string
	trackNameTranslations?: Record<string, string>
	createdAt: Date
	updatedAt: Date
}
