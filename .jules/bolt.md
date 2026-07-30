## Base64 Encoding Optimization in Deno

*   **Problem:** Converting a large `Uint8Array` to a Base64 string using a chunked loop with `String.fromCharCode` and string concatenation (`+=`) is extremely inefficient in JavaScript/V8. It leads to $O(N^2)$ memory copying behavior because strings are immutable, creating significant CPU and memory overhead for large files (e.g., images).
*   **Solution:** Use Deno's standard library `encodeBase64` from `jsr:@std/encoding/base64`. This function is implemented natively or with optimized typed array operations, drastically reducing execution time and memory allocations.
*   **Impact:** Benchmarks on a 15MB payload showed execution time drop from ~821ms (using chunked string concatenation) to ~94ms (using `encodeBase64`), an 8.7x performance improvement.
