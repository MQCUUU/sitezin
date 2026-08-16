export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    const maxMegabytes =
      Math.floor(
        maxBytes /
          1024 /
          1024
      );

    super(
      `O arquivo excede o limite de ${maxMegabytes} MB.`
    );

    this.name =
      "RequestBodyTooLargeError";
  }
}

export class InvalidJsonError extends Error {
  constructor() {
    super(
      "O arquivo enviado não contém um JSON válido."
    );

    this.name =
      "InvalidJsonError";
  }
}

export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes: number
): Promise<T> {
  const contentLength =
    request.headers.get(
      "content-length"
    );

  if (contentLength) {
    const declaredBytes =
      Number(contentLength);

    if (
      Number.isFinite(
        declaredBytes
      ) &&
      declaredBytes > maxBytes
    ) {
      throw new RequestBodyTooLargeError(
        maxBytes
      );
    }
  }

  if (!request.body) {
    throw new InvalidJsonError();
  }

  const reader =
    request.body.getReader();

  const decoder =
    new TextDecoder(
      "utf-8",
      {
        fatal: true
      }
    );

  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const {
        done,
        value
      } =
        await reader.read();

      if (done) {
        break;
      }

      totalBytes +=
        value.byteLength;

      if (
        totalBytes >
        maxBytes
      ) {
        await reader.cancel();

        throw new RequestBodyTooLargeError(
          maxBytes
        );
      }

      text += decoder.decode(
        value,
        {
          stream: true
        }
      );
    }

    text += decoder.decode();

    return JSON.parse(
      text
    ) as T;
  } catch (error) {
    if (
      error instanceof
        RequestBodyTooLargeError
    ) {
      throw error;
    }

    throw new InvalidJsonError();
  } finally {
    reader.releaseLock();
  }
}