export type CreateNotificationData = {
    title: string
    message: string
    userId: string;
    
}

export type UpdateNotificationData = {
    title?: string
    message?: string
    read?: boolean
}