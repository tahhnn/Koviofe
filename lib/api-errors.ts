export type ResolvedApiError = {
  title: string
  description: string
  href?: string
  hrefLabel?: string
  secondaryHref?: string
  secondaryHrefLabel?: string
  /** When true, UI must send the user to login (not just show a toast). */
  requiresLogin?: boolean
}

type ErrorRule = {
  test: (msg: string) => boolean
  resolve: (raw: string) => ResolvedApiError
}

const AUTH_PATTERNS =
  /UNAUTHORIZED_OR_FORBIDDEN|invalid or expired token|authorization header|authentication required|unauthorized/i

const rules: ErrorRule[] = [
  {
    test: (m) => /do not own this room/i.test(m),
    resolve: () => ({
      title: 'Bạn không phải chủ phòng này',
      description:
        'Link phòng thuộc tài khoản khác, hoặc bạn đang đăng nhập sai tài khoản. Tạo phòng mới từ Dashboard, hoặc Join bằng PIN nếu bạn là người chơi.',
      href: '/dashboard',
      hrefLabel: 'Về Dashboard',
      secondaryHref: '/join',
      secondaryHrefLabel: 'Join bằng PIN',
    }),
  },
  {
    test: (m) => AUTH_PATTERNS.test(m),
    resolve: () => ({
      title: 'Phiên đăng nhập đã hết hạn',
      description: 'Đang chuyển đến trang đăng nhập…',
      href: '/sign-in',
      hrefLabel: 'Đăng nhập lại',
      requiresLogin: true,
    }),
  },
  {
    test: (m) => /room not found or invalid pin|no room found|invalid pin/i.test(m),
    resolve: () => ({
      title: 'Không tìm thấy phòng',
      description: 'Kiểm tra lại mã PIN 6 số, hoặc hỏi host mã mới. Phòng có thể đã đóng.',
      href: '/join',
      hrefLabel: 'Thử Join lại',
    }),
  },
  {
    test: (m) => /room not found/i.test(m),
    resolve: () => ({
      title: 'Phòng không tồn tại',
      description: 'Phòng có thể đã kết thúc hoặc link không còn hợp lệ. Về Dashboard để tạo phòng mới.',
      href: '/dashboard',
      hrefLabel: 'Về Dashboard',
    }),
  },
  {
    test: (m) => /nickname is already taken/i.test(m),
    resolve: () => ({
      title: 'Nickname đã được dùng',
      description: 'Chọn một nickname khác rồi thử Join lại.',
      href: '/join',
      hrefLabel: 'Thử lại',
    }),
  },
  {
    test: (m) => /room is full|max .*players|capacity/i.test(m),
    resolve: () => ({
      title: 'Phòng đã đầy',
      description: 'Đợi người chơi khác rời phòng, hoặc Join phòng công khai khác.',
      href: '/join',
      hrefLabel: 'Xem phòng mở',
    }),
  },
  {
    test: (m) => /concurrent room limit/i.test(m),
    resolve: () => ({
      title: 'Đã đạt giới hạn phòng đồng thời',
      description: 'Kết thúc phòng đang mở (End Game) rồi tạo phòng mới, hoặc nâng cấp gói Pro.',
      href: '/dashboard',
      hrefLabel: 'Về Dashboard',
    }),
  },
  {
    test: (m) => /quiz has no questions/i.test(m),
    resolve: () => ({
      title: 'Quiz chưa có câu hỏi',
      description: 'Thêm ít nhất một câu hỏi trong trình chỉnh sửa rồi Launch lại.',
    }),
  },
  {
    test: (m) => m === 'ROOM_FINISHED' || /game already ended|already ended/i.test(m),
    resolve: () => ({
      title: 'Trận đấu đã kết thúc',
      description: 'Bạn có thể xem bảng xếp hạng hoặc về Dashboard để tạo trận mới.',
      href: '/dashboard',
      hrefLabel: 'Về Dashboard',
    }),
  },
  {
    test: (m) => /joining is closed|already in progress/i.test(m),
    resolve: () => ({
      title: 'Không thể vào phòng',
      description: 'Game đã bắt đầu, host đã đóng cửa Join. Đợi trận sau hoặc hỏi host mở phòng mới.',
      href: '/join',
      hrefLabel: 'Chọn phòng khác',
    }),
  },
  {
    test: (m) => /token room mismatch/i.test(m),
    resolve: () => ({
      title: 'Phiên chơi không khớp phòng',
      description: 'Token người chơi thuộc phòng khác. Join lại bằng đúng PIN của phòng hiện tại.',
      href: '/join',
      hrefLabel: 'Join lại',
    }),
  },
  {
    test: (m) => /player token|x-player-token/i.test(m),
    resolve: () => ({
      title: 'Phiên người chơi không hợp lệ',
      description: 'Token hết hạn hoặc thiếu. Vào lại phòng bằng mã PIN.',
      href: '/join',
      hrefLabel: 'Join lại',
    }),
  },
  {
    test: (m) => /forbidden|insufficient/i.test(m),
    resolve: () => ({
      title: 'Không đủ quyền',
      description:
        'Tài khoản hiện tại không được phép thực hiện thao tác này. Đăng nhập đúng tài khoản hoặc về Dashboard.',
      href: '/dashboard',
      hrefLabel: 'Về Dashboard',
    }),
  },
]

function normalizeErrorMessage(raw: unknown): string {
  const message =
    typeof raw === 'string'
      ? raw
      : raw instanceof Error
        ? raw.message
        : raw && typeof raw === 'object' && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : 'Unknown error'
  return message.trim() || 'Unknown error'
}

export function isAuthError(raw: unknown): boolean {
  return AUTH_PATTERNS.test(normalizeErrorMessage(raw))
}

export function resolveApiError(raw: unknown): ResolvedApiError {
  const normalized = normalizeErrorMessage(raw)

  for (const rule of rules) {
    if (rule.test(normalized)) {
      return rule.resolve(normalized)
    }
  }

  return {
    title: 'Đã xảy ra lỗi',
    description: `${normalized}. Thử lại, hoặc về Dashboard nếu vấn đề vẫn tiếp diễn.`,
    href: '/dashboard',
    hrefLabel: 'Về Dashboard',
  }
}

/** Format for inline error text (join form, etc.) */
export function formatApiErrorInline(raw: unknown): string {
  const resolved = resolveApiError(raw)
  return `${resolved.title}. ${resolved.description}`
}
