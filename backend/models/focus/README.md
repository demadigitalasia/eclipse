# Focus Framing models

These model files are used for local inference by the Studio Focus Framing feature. Video frames stay on the ECLIPSE server; no AI inference API is called.

| File | Purpose | Source | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `blaze_face_short_range.tflite` | Detect faces in sampled video frames | [MediaPipe model asset](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite) | Apache-2.0 ([model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf)) | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` |
| `efficientdet_lite0.tflite` | Detect people as the face fallback | [MediaPipe model asset](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite) | Apache-2.0 ([model listing](https://www.kaggle.com/models/tensorflow/efficientdet/tfLite)) | `40338edf5ec70d43e318b0a716a84d4564cd1802759a7a07170c7e43796dbf58` |

The applicable Apache 2.0 license text is included in [`Apache-2.0.txt`](./Apache-2.0.txt). The object detector was trained on COCO 2017. See [COCO terms](https://cocodataset.org/#termsofuse) for dataset attribution information. Retain this provenance and the applicable license notices when redistributing the model assets.

The MediaPipe runtime is Apache-2.0: [source repository and license](https://github.com/google-ai-edge/mediapipe).
