// Preserve the complete syscall ABI. Only optional io_uring/close_range fast paths
// return ENOSYS, allowing the caller's normal fallback. No variadic C forwarding.
.text
.global syscall
.type syscall,%function
syscall:
  cmp x0, #425
  b.eq .Lfallback
  cmp x0, #426
  b.eq .Lfallback
  cmp x0, #427
  b.eq .Lfallback
  cmp x0, #436
  b.eq .Lfallback
  mov x8, x0
  mov x0, x1
  mov x1, x2
  mov x2, x3
  mov x3, x4
  mov x4, x5
  mov x5, x6
  mov x6, x7
  svc #0
  cmn x0, #4095
  b.cs .Lerror
  ret
.Lfallback:
  b ohpt_syscall_fallback
.Lerror:
  stp x19, x30, [sp, #-16]!
  neg x19, x0
  bl __errno_location
  str w19, [x0]
  mov x0, #-1
  ldp x19, x30, [sp], #16
  ret
.size syscall, .-syscall
.section .note.GNU-stack,"",%progbits
