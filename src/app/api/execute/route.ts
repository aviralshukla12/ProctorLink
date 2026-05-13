import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { source_code, language_id, stdin, expected_output } = await req.json();

    const apiKey = process.env.JUDGE0_RAPID_API_KEY;
    const apiHost = process.env.JUDGE0_RAPID_API_HOST || "judge0-ce.p.rapidapi.com";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Judge0 API key not configured." },
        { status: 500 }
      );
    }

    const response = await fetch(`https://${apiHost}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_code,
        language_id,
        stdin: stdin || "",
        expected_output: expected_output || "",
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Judge0 API execution error:", error);
    return NextResponse.json(
      { error: "Failed to execute code." },
      { status: 500 }
    );
  }
}
