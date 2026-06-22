package com.suivibaby.model;

import java.util.List;

public record NapPage(List<NapResponse> items, String nextCursor) {
}
