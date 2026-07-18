import { IUserPublic } from "../users/users.types"

export interface INotification {
    id: string
    title: string
    message: string
    read: boolean
    userId: string
    createdAt: Date

}

export type INotificationPublic = INotification

export type INotificationWithUser = INotification & {
    user?: IUserPublic
}