import { getSession } from './session'

export const auth = {
  api: {
    getSession: async (_options?: any) => {
      return getSession()
    },
  },
}
