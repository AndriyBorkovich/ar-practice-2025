import os
import time
from typing import Optional
import cv2

from acquisition.base_video_input import BaseVideoInput
from acquisition.image_series_input import SavedImageSeriesInput
from preprocessing.video_slicing import MP4VideoSlicer


class RecordedVideoInput(BaseVideoInput):
    def __init__(self, video_url: str, crop_factor: Optional[float] = 1, resize_maxwidth: Optional[int] = None) -> None:
        super().__init__()
        self._video_url = video_url
        self.videoslicer = MP4VideoSlicer(video_url)
        self.is_started = False
        self.last_timestamp = None
        self._initialize_preprocess_frame(crop_factor, resize_maxwidth)

    def capture(self):
        new_timestamp = time.time()
        message = ''
        if self.last_timestamp is None:
            self.last_timestamp = new_timestamp
            difference_seconds = 0.001
        else:
            difference_seconds = new_timestamp - self.last_timestamp
            message += f'Overall FPS: {(1/difference_seconds):02f}. '
            self.last_timestamp = new_timestamp
            self.videoslicer.next_step_seconds = difference_seconds
        try:
            rval, frame = next(self.videoslicer)
            if not rval:
                self.destroy()
                return False
            image = self.preprocess_frame(frame)
            timestamp_after_extraction = time.time()
            algo_difference_seconds = difference_seconds - (timestamp_after_extraction - new_timestamp)
            message += f'Algorith part is: {(algo_difference_seconds / difference_seconds * 100):02f}. '
            print(message, end='\r')
            return image
        except Exception as e:
            self.destroy()
            return False

    def destroy(self):
        self.videoslicer.cleanup()
        return super().destroy()


class DefaultCameraVideoInput(BaseVideoInput):
    def __init__(self, crop_factor: float = 1, resize_maxwidth: Optional[int] = None) -> None:
        super().__init__()
        camera = cv2.VideoCapture(0)  # 0 is usually the default webcam
        if not camera.isOpened():
            raise Exception('Camera could not initialize')
        self.camera = camera
        self._initialize_preprocess_frame(crop_factor, resize_maxwidth)
    
    def capture(self):
        rval, frame = self.camera.read()
        if rval:
            return self.preprocess_frame(frame)
        return None

    def destroy(self):
        self.camera.release()
        return super().destroy()


def get_video_input(source_path=None, crop=None, maxwidth=None) -> BaseVideoInput:
    if source_path:
        # Decide if provided path is folder or video file
        if os.path.isfile(source_path):
            return RecordedVideoInput(source_path, crop_factor=crop, resize_maxwidth=maxwidth)
        else:
            return SavedImageSeriesInput(source_path, crop_factor=crop, resize_maxwidth=maxwidth)
    else:
        return DefaultCameraVideoInput(crop_factor=crop, resize_maxwidth=maxwidth)
