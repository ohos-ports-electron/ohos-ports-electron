#include <errno.h>
#include <stdio.h>
__attribute__((constructor)) static void loaded(void) {
  dprintf(2, "OHPTSYSCALL fallback_loaded arch=aarch64\n");
}
long ohpt_syscall_fallback(long number) {
  dprintf(2, "OHPTSYSCALL fallback=%ld errno=38\n", number);
  errno = ENOSYS;
  return -1;
}
