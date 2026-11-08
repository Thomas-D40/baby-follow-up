package com.suivibaby.mapper;

import com.suivibaby.entity.Dish;
import com.suivibaby.model.DishResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class DishMapper {

    public DishResponse toResponse(Dish dish) {
        return new DishResponse(dish.id, dish.label);
    }

    public List<DishResponse> toResponses(List<Dish> dishes) {
        return dishes.stream().map(this::toResponse).toList();
    }
}
