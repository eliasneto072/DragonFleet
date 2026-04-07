export type CreateNotificationInput = {
    title: string
    message: string
}

export type UpdateNotificationInput = {
    title?: string
    message?: string
    read?: boolean
}