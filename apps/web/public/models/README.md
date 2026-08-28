# Yange on-device cutout model

`u2netp.onnx` is the lightweight U²-Net-P salient-object model used only to
create a presentation derivative of a garment photo in the browser. The
original photo remains the evidence sent to Yange's garment analyser.

- Source implementation: <https://github.com/xuebinqin/U-2-Net>
- Browser-compatible ONNX artifact: <https://huggingface.co/edgetools/u2netp>
- Retrieval mirror: <https://github.com/Roy-rakun/u2net-models>
- License: Apache-2.0
- Expected SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
- Expected size: 4,574,861 bytes

The model is intentionally self-hosted so wardrobe photos never need to leave
the user's device for background removal and the demo is not coupled to a
third-party model CDN.
