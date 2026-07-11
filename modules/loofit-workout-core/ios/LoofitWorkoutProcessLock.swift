import Darwin
import Foundation

// Darwin also exposes a `flock` struct, which makes the POSIX function
// ambiguous to Swift. Bind the libc symbol explicitly.
@_silgen_name("flock")
private func loofit_flock(_ descriptor: Int32, _ operation: Int32) -> Int32

final class LoofitWorkoutProcessLock: @unchecked Sendable {
  private static let timeoutNanoseconds: UInt64 = 500_000_000
  private static let retryDelayMicroseconds: useconds_t = 10_000

  private var descriptor: Int32 = -1

  static func acquire(databaseDirectory: String) async throws -> LoofitWorkoutProcessLock {
    try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          continuation.resume(
            returning: try LoofitWorkoutProcessLock(databaseDirectory: databaseDirectory)
          )
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private init(databaseDirectory: String) throws {
    let normalized = LoofitWorkoutPaths.normalizeDatabaseDirectory(databaseDirectory)
    let directory = URL(fileURLWithPath: normalized, isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    let lockURL = directory.appendingPathComponent(
      "loofit-workout-pipeline.lock",
      isDirectory: false
    )
    descriptor = open(lockURL.path, O_CREAT | O_RDWR | O_CLOEXEC, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else {
      throw LoofitWorkoutCoreError.database(
        "Pipeline lock open failed: \(String(cString: strerror(errno)))"
      )
    }

    let deadline = DispatchTime.now().uptimeNanoseconds + Self.timeoutNanoseconds
    while loofit_flock(descriptor, LOCK_EX | LOCK_NB) != 0 {
      if errno == EINTR {
        continue
      }
      if errno == EWOULDBLOCK || errno == EAGAIN {
        guard DispatchTime.now().uptimeNanoseconds < deadline else {
          close(descriptor)
          descriptor = -1
          throw LoofitWorkoutCoreError.database(
            "Pipeline lock timed out after 500ms"
          )
        }
        usleep(Self.retryDelayMicroseconds)
        continue
      }
      let message = String(cString: strerror(errno))
      close(descriptor)
      descriptor = -1
      throw LoofitWorkoutCoreError.database("Pipeline lock failed: \(message)")
    }
  }

  func unlock() {
    guard descriptor >= 0 else { return }
    _ = loofit_flock(descriptor, LOCK_UN)
    close(descriptor)
    descriptor = -1
  }

  deinit {
    unlock()
  }
}
