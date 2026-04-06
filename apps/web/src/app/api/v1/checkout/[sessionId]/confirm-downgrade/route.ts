import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // Proxy the request to the backend API
    const response = await fetch(`${apiUrl}/v1/checkout/${sessionId}/confirm-downgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error confirming downgrade checkout:', error);
    return NextResponse.json(
      { message: 'Failed to schedule downgrade' },
      { status: 500 }
    );
  }
}
