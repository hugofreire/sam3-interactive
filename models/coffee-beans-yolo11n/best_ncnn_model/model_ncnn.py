import numpy as np
import ncnn
import torch

def test_inference():
    torch.manual_seed(0)
    in0 = torch.rand(1, 3, 640, 640, dtype=torch.float)
    out = []

    with ncnn.Net() as net:
        net.load_param("/home/hugo/PycharmProjects/sam3/backend/datasets/247a5c44-07ae-4620-b12d-2434557e5c23/models/2025-11-26_1764117712674/train/weights/best_ncnn_model/model.ncnn.param")
        net.load_model("/home/hugo/PycharmProjects/sam3/backend/datasets/247a5c44-07ae-4620-b12d-2434557e5c23/models/2025-11-26_1764117712674/train/weights/best_ncnn_model/model.ncnn.bin")

        with net.create_extractor() as ex:
            ex.input("in0", ncnn.Mat(in0.squeeze(0).numpy()).clone())

            _, out0 = ex.extract("out0")
            out.append(torch.from_numpy(np.array(out0)).unsqueeze(0))

    if len(out) == 1:
        return out[0]
    else:
        return tuple(out)

if __name__ == "__main__":
    print(test_inference())
